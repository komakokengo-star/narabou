
-- 1) match_status 列挙型 & matches拡張
CREATE TYPE public.match_status AS ENUM (
  'pending_approval','approved','rejected','arrived','in_progress','completed','canceled'
);

ALTER TABLE public.matches
  ADD COLUMN status public.match_status NOT NULL DEFAULT 'pending_approval',
  ADD COLUMN approved_at timestamptz,
  ADD COLUMN rejected_at timestamptz;

-- 既存データは approved 相当に
UPDATE public.matches SET status='approved', approved_at=created_at WHERE approved_at IS NULL;

-- 2) payments に authorized / canceled 状態を追加、capture_method フラグ
ALTER TYPE public.payment_status ADD VALUE IF NOT EXISTS 'authorized';
ALTER TYPE public.payment_status ADD VALUE IF NOT EXISTS 'canceled';

ALTER TABLE public.payments
  ADD COLUMN captured_at timestamptz,
  ADD COLUMN authorized_at timestamptz;

-- 3) 管理者通知テーブル（リアルタイム）
CREATE TABLE public.admin_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,           -- request_created, match_pending, match_approved, payment_authorized, payment_captured, request_completed, request_canceled, refund_issued, anomaly_high_refund, anomaly_repeated_cancel
  severity text NOT NULL DEFAULT 'info', -- info, warn, alert
  title text NOT NULL,
  body text,
  request_id uuid,
  actor_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.admin_notifications TO authenticated;
GRANT ALL ON public.admin_notifications TO service_role;
ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins can read notifications" ON public.admin_notifications
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admins can update notifications" ON public.admin_notifications
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE INDEX admin_notifications_created_idx ON public.admin_notifications(created_at DESC);
CREATE INDEX admin_notifications_unread_idx ON public.admin_notifications(read_at) WHERE read_at IS NULL;

-- realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_notifications;

-- 4) 自動通知トリガ関数
CREATE OR REPLACE FUNCTION public.notify_admin(
  p_kind text, p_severity text, p_title text, p_body text,
  p_request_id uuid, p_actor_id uuid, p_details jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
BEGIN
  INSERT INTO public.admin_notifications(kind,severity,title,body,request_id,actor_id,details)
  VALUES (p_kind,p_severity,p_title,p_body,p_request_id,p_actor_id,COALESCE(p_details,'{}'::jsonb));
END; $$;

-- requests 変更 → 通知＋監査
CREATE OR REPLACE FUNCTION public.on_requests_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify_admin(
      'request_created','info',
      '新規依頼: ' || NEW.store_name,
      '#'||COALESCE(LPAD(NEW.request_number::text,4,'0'),'----')||' が作成されました',
      NEW.id, NEW.customer_id,
      jsonb_build_object('total_fee',NEW.total_fee,'is_peak',NEW.is_peak)
    );
    INSERT INTO public.audit_logs(actor_id,action,target_type,target_id,details)
      VALUES (COALESCE(v_actor,NEW.customer_id),'request_created','request',NEW.id,
        jsonb_build_object('store_name',NEW.store_name,'total_fee',NEW.total_fee));
  ELSIF TG_OP='UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.audit_logs(actor_id,action,target_type,target_id,details)
      VALUES (v_actor,'request_status_changed','request',NEW.id,
        jsonb_build_object('from',OLD.status,'to',NEW.status));
    IF NEW.status='completed' THEN
      PERFORM public.notify_admin('request_completed','info',
        '依頼完了: '||NEW.store_name,
        '#'||COALESCE(LPAD(NEW.request_number::text,4,'0'),'----')||' が完了',
        NEW.id, v_actor, jsonb_build_object('total_fee',NEW.total_fee));
    ELSIF NEW.status='canceled' THEN
      PERFORM public.notify_admin('request_canceled','warn',
        '依頼キャンセル: '||NEW.store_name,
        '#'||COALESCE(LPAD(NEW.request_number::text,4,'0'),'----')||' がキャンセル',
        NEW.id, v_actor, jsonb_build_object('previous_status',OLD.status));
      -- 連続キャンセル検知（同一顧客が24h内3件以上）
      IF (SELECT COUNT(*) FROM public.requests
          WHERE customer_id=NEW.customer_id AND status='canceled'
            AND created_at > now() - interval '24 hours') >= 3 THEN
        PERFORM public.notify_admin('anomaly_repeated_cancel','alert',
          '連続キャンセル検知',
          '同一利用者が24時間以内に3件以上キャンセルしています',
          NEW.id, NEW.customer_id,
          jsonb_build_object('customer_id',NEW.customer_id));
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_requests_change ON public.requests;
CREATE TRIGGER trg_requests_change
  AFTER INSERT OR UPDATE ON public.requests
  FOR EACH ROW EXECUTE FUNCTION public.on_requests_change();

-- matches 変更
CREATE OR REPLACE FUNCTION public.on_matches_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_req public.requests;
BEGIN
  SELECT * INTO v_req FROM public.requests WHERE id = COALESCE(NEW.request_id, OLD.request_id);
  IF TG_OP='INSERT' THEN
    PERFORM public.notify_admin('match_pending','info',
      '受注リクエスト: '||v_req.store_name,
      '代行者からの受注申請。依頼者の承認待ち',
      NEW.request_id, NEW.worker_id, jsonb_build_object('match_id',NEW.id));
    INSERT INTO public.audit_logs(actor_id,action,target_type,target_id,details)
      VALUES (NEW.worker_id,'match_requested','match',NEW.id,
        jsonb_build_object('request_id',NEW.request_id));
  ELSIF TG_OP='UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.audit_logs(actor_id,action,target_type,target_id,details)
      VALUES (v_actor,'match_status_changed','match',NEW.id,
        jsonb_build_object('from',OLD.status,'to',NEW.status,'request_id',NEW.request_id));
    IF NEW.status='approved' THEN
      PERFORM public.notify_admin('match_approved','info',
        'マッチ成立: '||v_req.store_name,'依頼者が承認、決済オーソリへ',
        NEW.request_id, v_actor, jsonb_build_object('match_id',NEW.id));
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_matches_change ON public.matches;
CREATE TRIGGER trg_matches_change
  AFTER INSERT OR UPDATE ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.on_matches_change();

-- payments 変更
CREATE OR REPLACE FUNCTION public.on_payments_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_req public.requests;
BEGIN
  SELECT * INTO v_req FROM public.requests WHERE id = NEW.request_id;
  IF TG_OP='UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.audit_logs(actor_id,action,target_type,target_id,details)
      VALUES (NULL,'payment_status_changed','payment',NEW.id,
        jsonb_build_object('from',OLD.status,'to',NEW.status,'amount',NEW.amount,'request_id',NEW.request_id));
    IF NEW.status='authorized' THEN
      PERFORM public.notify_admin('payment_authorized','info',
        '決済オーソリ: '||v_req.store_name,'与信確保 ¥'||NEW.amount,
        NEW.request_id, NULL, jsonb_build_object('amount',NEW.amount,'kind',NEW.kind));
    ELSIF NEW.status='paid' THEN
      PERFORM public.notify_admin('payment_captured','info',
        '決済確定: '||v_req.store_name,'キャプチャ完了 ¥'||NEW.amount,
        NEW.request_id, NULL, jsonb_build_object('amount',NEW.amount,'kind',NEW.kind));
    ELSIF NEW.status IN ('refunded','partially_refunded') AND COALESCE(NEW.refund_amount,0) > COALESCE(OLD.refund_amount,0) THEN
      PERFORM public.notify_admin(
        CASE WHEN NEW.refund_amount >= 5000 THEN 'anomaly_high_refund' ELSE 'refund_issued' END,
        CASE WHEN NEW.refund_amount >= 5000 THEN 'alert' ELSE 'warn' END,
        '返金処理: '||v_req.store_name,'¥'||NEW.refund_amount||' を返金',
        NEW.request_id, NULL, jsonb_build_object('refund_amount',NEW.refund_amount));
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_payments_change ON public.payments;
CREATE TRIGGER trg_payments_change
  AFTER UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.on_payments_change();

-- realtimeで他テーブルも購読可
ALTER PUBLICATION supabase_realtime ADD TABLE public.requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.matches;
ALTER PUBLICATION supabase_realtime ADD TABLE public.payments;

-- 5) matches RLS 追加: 依頼者が自分の依頼のマッチを更新可能（承認/拒否）
DROP POLICY IF EXISTS "customer can update own request match" ON public.matches;
CREATE POLICY "customer can update own request match" ON public.matches
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.requests r WHERE r.id=matches.request_id AND r.customer_id=auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.requests r WHERE r.id=matches.request_id AND r.customer_id=auth.uid()));

DROP POLICY IF EXISTS "customer can read own request match" ON public.matches;
CREATE POLICY "customer can read own request match" ON public.matches
  FOR SELECT TO authenticated
  USING (
    worker_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.requests r WHERE r.id=matches.request_id AND r.customer_id=auth.uid())
    OR public.has_role(auth.uid(),'admin')
  );
