/**
 * Render nav with `LanguageMenu`, `NotificationMenu`, `PlayerName`.
 * refs: none
 */
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Search, ChevronDown, Globe2, Menu, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { SUPPORTED_LOCALES, useLocalization } from "@/lib/localization-context";
import {
  getWallpaperEnabled,
  setWallpaperEnabled,
  WALLPAPER_CHANGE_EVENT,
} from "@/lib/wallpaper-preference";
import { getLiteMode, setLiteMode, LITE_MODE_CHANGE_EVENT } from "@/lib/lite-mode";
import PlayerName from "@/components/player-name";
import NotificationMenu from "@/components/notification-menu";
import HomeSearch from "@/components/home-search";
import { BLOG_COPY_KEYS } from "@/lib/blog-copy";

/** Reuse the homepage search behavior inside the header's fade toggle. */
function HeaderSearch({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useLocalization();
  const buttonRef = useRef<HTMLButtonElement>(null);
  return (
    <div className="pc-header-search-slot" data-header-search data-open={open}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onOpenChange(false);
          buttonRef.current?.focus();
        }
      }}>
    <button ref={buttonRef} type="button" aria-label={t("search.submit")} aria-expanded={open}
      aria-hidden={open} tabIndex={open ? -1 : 0}
      onClick={() => onOpenChange(true)}
      className="pc-header-search-trigger flex h-11 w-11 items-center justify-center rounded-lg text-pc-text-secondary hover:bg-pc-bg-elevated hover:text-pc-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pc-accent">
      <Search className="h-4 w-4" aria-hidden="true" />
    </button>
    <HomeSearch variant="header" active={open} onNavigate={() => onOpenChange(false)} />
    </div>
  );
}

function LanguageMenu() {
  const { locale, setLocale, t } = useLocalization();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const activeLocale = SUPPORTED_LOCALES.find(({ code }) => code === locale) ?? SUPPORTED_LOCALES[0];

  useEffect(() => {
    if (!open) return;
    const closeOnPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", closeOnPointerDown);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("mousedown", closeOnPointerDown);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={menuRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex h-11 w-11 items-center justify-center gap-1.5 rounded-lg px-2 text-sm text-pc-text-secondary transition-colors hover:bg-pc-bg-elevated hover:text-pc-accent min-[480px]:h-9 min-[480px]:w-auto"
        aria-label={t("nav.language")}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Globe2 aria-hidden="true" className="h-4 w-4" />
        <span className="hidden max-w-20 truncate text-xs font-semibold tracking-wide min-[480px]:inline">{activeLocale.code.toUpperCase()}</span>
        <ChevronDown aria-hidden="true" className={`hidden h-3 w-3 transition-transform min-[480px]:block ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-60 overflow-hidden rounded-xl border border-pc-border bg-pc-bg-secondary p-1 shadow-lg" role="listbox" aria-label={t("nav.language")}>
          {SUPPORTED_LOCALES.map(({ code, nativeName }) => (
            <button
              key={code}
              type="button"
              onClick={() => {
                setLocale(code);
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${locale === code ? "bg-pc-bg-elevated text-pc-accent" : "text-pc-text-secondary hover:bg-pc-bg-elevated hover:text-pc-text"}`}
              role="option"
              aria-selected={locale === code}
            >
              <span>{nativeName}</span>
              <span className="text-xs text-pc-text-muted">{code.toUpperCase()}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Render nav with `LanguageMenu`, `NotificationMenu`, `PlayerName`.
 * refs: none
 * I/O types: `none -> JSX.Element`.
 */
export default function Nav() {
  const pathname = usePathname();
  const { user, isLoading: authLoading, logout } = useAuth();
  const { t } = useLocalization();
  const [sideMenuOpen, setSideMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!searchOpen) return;
    const closeOutsideSearch = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || !navRef.current?.contains(target) || !target.closest("[data-header-search]")) setSearchOpen(false);
    };
    window.addEventListener("pointerdown", closeOutsideSearch);
    return () => window.removeEventListener("pointerdown", closeOutsideSearch);
  }, [searchOpen]);
  const [wallpaperEnabled, setWallpaperEnabledState] = useState(true);
  const [liteMode, setLiteModeState] = useState(false);
  const canAccessProjects = user?.isAdmin === true || user?.isProjectDeveloper === true;
  const canAccessAdmin = user?.isAdmin === true;
  const projectsHref = "/operations/projects";
  const developerHref = "/operations/developer";
  const levelAbbreviation = t("common.playerChampions.level", { level: "" }).trim();
  const accountLevelLabel = [t("generated.players.account"), levelAbbreviation].join(" ");
  const championLevelLabel = [t("generated.players.champion"), levelAbbreviation].join(" ");
  const leaderboardLinks = [
    { href: "/players/leaderboard", label: t("generated.players.ranked") },
    { href: "/players/elo/account", label: t("generated.players.accountElo") },
    { href: "/players/elo/champion", label: t("generated.players.championElo") },
    { href: "/players/performance/account", label: t("stats.scope.performance", { mode: t("generated.players.account") }) },
    { href: "/players/performance/champion", label: t("stats.scope.performance", { mode: t("generated.players.champion") }) },
    { href: "/players/levels/account", label: accountLevelLabel },
    { href: "/players/levels/champion", label: championLevelLabel },
  ];

  const headerGroups = [
    {
      title: t("nav.game"),
      links: [
        { href: "/champions", label: t("nav.champions") },
        { href: "/matches", label: t("nav.matches") },
        { href: "/players", label: t("menu.playerHub") },
      ],
    },
    {
      title: t("nav.community"),
      links: [
        { href: "/community", label: t("nav.community") },
        { href: "/community/diminishing-returns", label: t("diminishingReturns.navLabel") },
        { href: "/builds", label: t("nav.builds") },
        { href: "/tierlists", label: t("menu.tierLists") },
      ],
    },
    {
      title: t("nav.operations"),
      links: [
        { href: "/blog", label: t(BLOG_COPY_KEYS.title) },
        { href: "/changelog", label: t("menu.changelog") },
        { href: "/operations/tickets", label: t("generated.operations.tickets") },
        ...(canAccessProjects ? [{ href: projectsHref, label: t("generated.operations.projects") }] : []),
        ...(canAccessProjects ? [{ href: developerHref, label: t("generated.operations.developer") }] : []),
        ...(canAccessAdmin ? [{ href: "/admin", label: t("generated.operations.roleAdmin") }] : []),
        { href: "/operations/paladinscat-bot", label: t("menu.paladinsCatBot") },
        { href: "/operations/stats", label: t("menu.paladinsCatStats") },
        { href: "https://translate.paladinscat.com/", label: t("nav.localization") },
      ],
    },
  ];

  // The full side menu mirrors the directory architecture rather than the
  // compact desktop hover menu. This keeps every player directory reachable
  // on mobile while separating leaderboards from moderation and community
  // labels.
  const menuSections = [
    { title: t("menu.browse"), links: [{ href: "/", label: t("menu.home") }] },
    headerGroups[0],
    {
      title: t("nav.players"),
      links: [
        { href: "/players", label: t("menu.playerHub") },
        { href: "/players/private-tracking", label: t("generated.players.privateAccounts") },
        { href: "/players/parties", label: t("generated.players.rankedParties") },
      ],
    },
    {
      title: t("menu.leaderboards"),
      links: leaderboardLinks,
    },
    {
      title: t("generated.players.moderation"),
      links: [
        { href: "/players/cheaters", label: t("generated.players.cheaters") },
        { href: "/evidence", label: t("moderation.evidencePortal") },
        { href: "/players/boosted", label: t("moderation.boostedPlayers") },
        { href: "/players/suspicious", label: t("generated.players.suspiciousPlayers") },
        { href: "/players/droppers", label: t("moderation.droppersTitle") },
        { href: "/players/afk-wintrade", label: t("moderation.afkWintradeTitle") },
        { href: "/players/alt-accounts", label: t("moderation.altAccountsTitle") },
      ],
    },
    {
      title: t("menu.playerLabels"),
      links: [
        { href: "/players/weirdos", label: t("moderation.weirdoTitle") },
        { href: "/players/hall-of-fame", label: t("moderation.hallOfFameTitle") },
      ],
    },
    {
      title: t("nav.stats"),
      links: [{ href: "/stats", label: t("menu.globalStats") }],
    },
    ...headerGroups.slice(3),
    { title: t("menu.site"), links: [{ href: "/localization", label: t("nav.localization") }, { href: "/about", label: t("menu.about") }, { href: "/contact", label: t("menu.contact") }, { href: "/privacy", label: t("menu.privacy") }, { href: "/terms", label: t("menu.terms") }] },
  ];

  useEffect(() => {
    if (!sideMenuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === t("generated.components.nav.escape")) {
        setSideMenuOpen(false);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [sideMenuOpen]);

  useEffect(() => {
    if (!sideMenuOpen) return;
    const previousBodyOverflow = document.body.style.overflow;
    const previousRootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousRootOverflow;
    };
  }, [sideMenuOpen]);

  useEffect(() => {
    const syncWallpaperPreference = () => setWallpaperEnabledState(getWallpaperEnabled());
    syncWallpaperPreference();
    window.addEventListener(WALLPAPER_CHANGE_EVENT, syncWallpaperPreference);
    window.addEventListener("storage", syncWallpaperPreference);
    return () => {
      window.removeEventListener(WALLPAPER_CHANGE_EVENT, syncWallpaperPreference);
      window.removeEventListener("storage", syncWallpaperPreference);
    };
  }, []);

  useEffect(() => {
    const syncLiteMode = () => setLiteModeState(getLiteMode());
    syncLiteMode();
    window.addEventListener(LITE_MODE_CHANGE_EVENT, syncLiteMode);
    window.addEventListener("storage", syncLiteMode);
    return () => {
      window.removeEventListener(LITE_MODE_CHANGE_EVENT, syncLiteMode);
      window.removeEventListener("storage", syncLiteMode);
    };
  }, []);

  useEffect(() => {
    const openSiteMenu = () => setSideMenuOpen(true);
    window.addEventListener("paladinscat:open-site-menu", openSiteMenu);
    return () => window.removeEventListener("paladinscat:open-site-menu", openSiteMenu);
  }, []);

  async function handleLogout() {
    await logout();
    setSideMenuOpen(false);
  }

  function handleWallpaperToggle() {
    const next = !wallpaperEnabled;
    setWallpaperEnabledState(next);
    setWallpaperEnabled(next);
  }

  function handleLiteModeToggle() {
    const next = !liteMode;
    setLiteModeState(next);
    setLiteMode(next);
    if (next) {
      // Lite mode is for low-powered devices — also turn off the wallpaper.
      setWallpaperEnabledState(false);
      setWallpaperEnabled(false);
    } else {
      // Leaving Lite mode — restore the wallpaper.
      setWallpaperEnabledState(true);
      setWallpaperEnabled(true);
    }
  }

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);
  const isMenuActive = (href: string) => {
    if (href === "/" || href === "/stats" || href === "/players") return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  };
  // Auth state is client-resolved. Keep the server and first client render on
  // the same logged-out branch until the session check completes.
  const resolvedUser = authLoading ? null : user;
  const profileHref = resolvedUser?.linkedPlayerId ? `/players/${resolvedUser.linkedPlayerId}` : "/link-account";
  const loginHref = `/auth/login?redirect=${encodeURIComponent(pathname || "/")}`;
  const accountLabel = resolvedUser
    ? (resolvedUser.linkedPlayerName ?? resolvedUser.username ?? "").replace(/_/g, " ")
    : "";

  return (
    <>
      {/* Keep navigation readable while the wallpaper shows through the fading gradient. */}
      <nav ref={navRef} className="pc-site-header sticky top-0 z-50">
        <div className="mx-auto max-w-[1536px] px-4 sm:px-6 lg:px-8">
          {/* Equal side tracks keep the destinations centered independently of controls. */}
          <div className="hidden grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 min-[1180px]:grid" style={{ height: 64 }}>
            {/* Left: fixed-width logo */}
            <div className="min-w-0 justify-self-start">
              <Link href="/" className="relative text-xl font-bold text-pc-text hover:text-pc-text-muted transition-colors flex items-center gap-2">
                <img src="/images/icons/paladinscat.avif" alt="" className="w-7 h-7" />
                {t("generated.common.paladinscat")}
                {liteMode && (
                  <span className="absolute -right-7 -top-2.5 rounded bg-pc-accent px-1 text-xs font-bold leading-tight text-pc-bg" aria-label={t("menu.liteMode")}>
                    {t("menu.lite")}
                  </span>
                )}
              </Link>
            </div>

            {/* Center: grouped destinations use the same hover/focus behavior as Account. */}
            <div inert={searchOpen} aria-hidden={searchOpen} className={`pc-header-destinations flex items-center justify-center gap-4 2xl:gap-7 ${searchOpen ? "pointer-events-none opacity-0" : "opacity-100"}`}>
              {headerGroups.map((group) => {
                const groupActive = group.links.some((link) => isActive(link.href));
                if (group.links.length === 1) {
                  return <Link key={group.title} href={group.links[0].href} className={`pc-nav-link ${groupActive ? "pc-nav-link-active" : ""}`}>{group.title}</Link>;
                }
                return (
                  <div key={group.title} className="group relative flex items-center">
                    <span className={`pc-nav-link inline-flex items-center gap-1 ${groupActive ? "pc-nav-link-active" : ""}`}>
                      {group.title}
                      <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 transition-transform group-hover:rotate-180" />
                    </span>
                    <div className="pointer-events-none invisible absolute left-1/2 top-full z-20 w-64 -translate-x-1/2 pt-2 opacity-0 transition-all group-hover:pointer-events-auto group-hover:visible group-hover:opacity-100">
                      <div className="max-h-[calc(100vh-5rem)] overflow-y-auto overscroll-contain rounded-lg border border-pc-border bg-pc-bg-secondary p-2 shadow-md" role="menu" aria-label={group.title}>
                        {group.links.map((link) => (
                          <Link
                            key={link.href}
                            href={link.href}
                            role="menuitem"
                            className={`block rounded-md px-3 py-2.5 text-sm transition-colors ${isMenuActive(link.href) ? "bg-pc-bg-elevated text-pc-accent" : "text-pc-text-secondary hover:bg-pc-bg-elevated hover:text-pc-text"}`}
                          >
                            {link.label}
                          </Link>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Right: grouped menu and account controls */}
            <div className="relative flex min-w-0 justify-self-end items-center justify-end gap-2" suppressHydrationWarning>
              <HeaderSearch open={searchOpen} onOpenChange={setSearchOpen} />
              <LanguageMenu />
              <NotificationMenu />
              <button
                onClick={() => setSideMenuOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-pc-text-secondary transition-colors hover:bg-pc-bg-elevated hover:text-pc-accent"
                aria-label={t("nav.openSiteMenu")}
                aria-expanded={sideMenuOpen}
              >
                <Menu aria-hidden="true" size={16} />
                {t("nav.menu")}
              </button>
              {resolvedUser ? (
                <div className="group relative flex items-center">
                  <Link
                    href={profileHref}
                    className="block max-w-36 truncate rounded-md px-1 py-1 text-sm text-pc-text-secondary transition-colors hover:text-pc-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pc-accent"
                  >
                    {resolvedUser.linkedPlayerId ? <PlayerName playerId={resolvedUser.linkedPlayerId} verified>{accountLabel}</PlayerName> : accountLabel}
                  </Link>
                  <div className="pointer-events-none invisible absolute right-0 top-full z-10 w-44 pt-2 opacity-0 transition-all group-hover:pointer-events-auto group-hover:visible group-hover:opacity-100">
                    <div className="rounded-lg border border-pc-border bg-pc-bg-secondary p-1 shadow-md" role="menu">
                      <Link href={profileHref} className="block rounded-md px-3 py-2 text-sm text-pc-text-secondary transition-colors hover:bg-pc-bg-elevated hover:text-pc-text" role="menuitem">{t("generated.common.profile")}</Link>
                      <Link href="/account" className="block rounded-md px-3 py-2 text-sm text-pc-text-secondary transition-colors hover:bg-pc-bg-elevated hover:text-pc-text" role="menuitem">{t("generated.common.accountSettings")}</Link>
                      <button onClick={handleLogout} className="block w-full rounded-md px-3 py-2 text-left text-sm text-pc-text-secondary transition-colors hover:bg-pc-bg-elevated hover:text-pc-text" role="menuitem">{t("nav.logout")}</button>
                    </div>
                  </div>
                </div>
              ) : (
                <a href={loginHref} className="pc-btn-secondary text-sm">{t("nav.login")}</a>
              )}
            </div>
          </div>

          {/* ── Mobile Layout ── */}
          <div className="flex items-center gap-3 min-[1180px]:hidden" style={{ height: 64 }}>
            <Link href="/" aria-label={t("generated.common.paladinscat")} className={`relative ${searchOpen ? "hidden min-[480px]:block" : "block"} shrink-0 text-base font-bold text-pc-text transition-colors hover:text-pc-text-muted sm:text-xl`}>
              <span className="flex items-center gap-1 sm:gap-2"><img src="/images/icons/paladinscat.avif" alt="" className="h-6 w-6 sm:h-7 sm:w-7" />
              <span className="hidden md:inline">{t("generated.common.paladinscat")}</span>
              </span>
              {liteMode && (
                <span className="absolute right-0 -top-3 rounded bg-pc-accent px-1 text-xs font-bold leading-tight text-pc-bg sm:-right-7 sm:-top-2.5" aria-label={t("menu.liteMode")}>
                  {t("menu.lite")}
                </span>
              )}
            </Link>

            <div className="flex min-w-0 flex-1 items-center justify-end gap-1" suppressHydrationWarning>
              <HeaderSearch open={searchOpen} onOpenChange={setSearchOpen} />
              <LanguageMenu />
              <NotificationMenu />
              <button
                onClick={() => setSideMenuOpen(true)}
                className="pc-touch-target p-2 text-pc-text transition-colors hover:text-pc-accent"
                aria-label={t("generated.common.menu")}
              >
                <Menu aria-hidden="true" size={24} />
              </button>
            </div>
          </div>
        </div>
      </nav>

      {sideMenuOpen && (
        <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={t("nav.menu")}>
          <button className="absolute inset-0 pc-glass-dark" onClick={() => setSideMenuOpen(false)} aria-label={t("nav.closeSiteMenu")} />
          <aside className="absolute inset-y-0 right-0 flex w-[min(24rem,calc(100vw-2rem))] flex-col border-l border-pc-border bg-pc-bg-secondary shadow-lg">
            <div className="flex items-center justify-between border-b border-pc-border px-5 py-4">
              <Link href="/" onClick={() => setSideMenuOpen(false)} className="flex items-center gap-2 font-bold text-pc-text"><img src="/images/icons/paladinscat.avif" alt="" className="h-6 w-6" />{t("generated.common.paladinscat")}</Link>
              <button onClick={() => setSideMenuOpen(false)} className="rounded-lg p-2 text-pc-text-secondary hover:bg-pc-bg-elevated hover:text-pc-accent" aria-label={t("nav.closeSiteMenu")}><X aria-hidden="true" size={20} /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5">
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                {menuSections.map((section) => <section key={section.title}><h2 className="mb-2 px-2 text-xs font-bold uppercase tracking-widest text-pc-text-muted">{section.title}</h2><div className="space-y-0.5">{section.links.map((link) => <Link key={link.href} href={link.href} onClick={() => setSideMenuOpen(false)} className={`block rounded-lg px-2.5 py-2 text-sm transition-colors ${isMenuActive(link.href) ? "bg-pc-bg-elevated text-pc-accent" : "text-pc-text-secondary hover:bg-pc-bg-elevated hover:text-pc-text"}`}>{link.label}</Link>)}</div></section>)}
                <section>
                  <h2 className="mb-2 px-2 text-xs font-bold uppercase tracking-widest text-pc-text-muted">{t("menu.appearance")}</h2>
                  <button
                    type="button"
                    onClick={handleWallpaperToggle}
                    className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm text-pc-text-secondary transition-colors hover:bg-pc-bg-elevated hover:text-pc-text"
                    aria-pressed={wallpaperEnabled}
                  >
                    <span>
                      <span className="block">{t("menu.mapWallpaper")}</span>
                      <span className="mt-0.5 block text-xs text-pc-text-muted">{wallpaperEnabled ? t("menu.enabled") : t("menu.darkGreyOnly")}</span>
                    </span>
                    <span className={`relative h-5 w-9 rounded-full transition-colors ${wallpaperEnabled ? "bg-pc-accent" : "bg-pc-bg"}`} aria-hidden="true">
                      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${wallpaperEnabled ? "translate-x-4" : "translate-x-0.5"}`} />
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={handleLiteModeToggle}
                    className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm text-pc-text-secondary transition-colors hover:bg-pc-bg-elevated hover:text-pc-text"
                    aria-pressed={liteMode}
                  >
                    <span>
                      <span className="block">{t("menu.liteMode")}</span>
                      <span className="mt-0.5 block text-xs text-pc-text-muted">{liteMode ? t("menu.enabled") : t("menu.liteModeOff")}</span>
                    </span>
                    <span className={`relative h-5 w-9 rounded-full transition-colors ${liteMode ? "bg-pc-accent" : "bg-pc-bg"}`} aria-hidden="true">
                      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${liteMode ? "translate-x-4" : "translate-x-0.5"}`} />
                    </span>
                  </button>
                </section>
              </div>
            </div>
            <div className="border-t border-pc-border px-5 py-4">
              {resolvedUser ? <div className="flex items-center justify-between gap-3"><Link href={profileHref} onClick={() => setSideMenuOpen(false)} className="min-w-0 truncate text-sm text-pc-text-secondary hover:text-pc-accent">{resolvedUser.linkedPlayerId ? <PlayerName playerId={resolvedUser.linkedPlayerId} verified>{accountLabel}</PlayerName> : accountLabel}</Link><Link href="/account" onClick={() => setSideMenuOpen(false)} className="text-xs text-pc-text-muted hover:text-pc-accent">{t("generated.common.account")}</Link><button onClick={handleLogout} className="pc-btn-ghost text-sm">{t("nav.logout")}</button></div> : <a href={loginHref} className="pc-btn-secondary block w-full text-center text-sm">{t("nav.login")}</a>}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
