DO $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = 'info@narabou.jp'
    AND email_confirmed_at IS NOT NULL
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE NOTICE 'No confirmed user found for info@narabou.jp. Skipping admin grant.';
    RETURN;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;

  RAISE NOTICE 'Admin role granted to user % (info@narabou.jp).', v_user_id;
END $$;