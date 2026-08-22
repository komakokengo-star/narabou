import { useTranslation } from "react-i18next";
import { Link, useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useRoles } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Globe, LogOut, User as UserIcon } from "lucide-react";

export function Header() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { data: roles } = useRoles(user?.id);
  const router = useRouter();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.navigate({ to: "/" });
  };

  return (
    <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-40">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <img
            src="/icons/icon-192.png"
            alt="NARABOU"
            className="w-9 h-9 rounded-md object-cover"
          />
          <div className="leading-tight">
            <div className="font-serif font-semibold text-base">{t("app.name")}</div>
          </div>
        </Link>

        <nav className="flex items-center gap-2">
          {user && (
            <Link
              to="/dashboard"
              className="text-sm text-muted-foreground hover:text-foreground px-3"
            >
              {t("nav.dashboard")}
            </Link>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={t("common.language")}>
                <Globe className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => i18n.changeLanguage("ja")}>
                {t("common.japanese")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => i18n.changeLanguage("en")}>
                {t("common.english")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => i18n.changeLanguage("ko")}>
                {t("common.korean")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => i18n.changeLanguage("zh-TW")}>
                {t("common.traditionalChinese")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2" aria-label={t("nav.account")}>
                  <UserIcon className="w-4 h-4" />
                  <span className="hidden sm:inline text-xs text-muted-foreground">
                    {roles?.map((r) => t(`role.${r}`)).join(" / ")}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="w-4 h-4 mr-2" /> {t("nav.logout")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Link to="/auth">
              <Button size="sm">{t("nav.login")}</Button>
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
