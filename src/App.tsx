import { lazy, Suspense, useCallback, useEffect, useState, type ComponentType } from "react";
import { rememberAccount } from "./lib/ref";
import { adminToDo, api, type Me } from "./api";
import { clearSnapshots, readSnapshot, writeSnapshot } from "./lib/snapshot";
import { Link } from "./components/Link";
import { TabBar } from "./components/TabBar";
import { matchPath, navigate, usePath } from "./router";
import { ComingSoon } from "./pages/ComingSoon";
import { Feed } from "./pages/Feed";
import { Cotw } from "./pages/Cotw";
import { Home, VerifyNotice } from "./pages/Home";
import { QuickSignIn } from "./pages/QuickSignIn";
import { PickVoice } from "./pages/PickVoice";
import { markWelcomed, welcomed } from "./lib/install";
import { keepPushOn, setIconBadge } from "./lib/push";
import { PushPrompt } from "./components/PushPrompt";
import { GoldenCrisp } from "./components/GoldenCrisp";
import { maybeReleaseGoldenCrisp } from "./lib/goldenCrisp";
import { VoiceProvider } from "./lib/voice";
import { line } from "../shared/voice";

// Code splitting: the feed (where the app opens) is in the first download;
// every other page is its own small file, fetched the first time it's needed.
// Once the feed is up, they're all fetched quietly in the background (see
// preloadPages below), so tapping a tab doesn't wait for the network. The
// service worker keeps them all on the phone after that (public/sw.js).
const pageLoaders: (() => Promise<unknown>)[] = [];
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any page's props
function lazyPage<M extends Record<K, ComponentType<any>>, K extends keyof M>(load: () => Promise<M>, name: K) {
  pageLoaders.push(load);
  return lazy(() => load().then((m) => ({ default: m[name] })));
}
const AdminSnacks = lazyPage(() => import("./pages/AdminSnacks"), "AdminSnacks");
const AdminUsers = lazyPage(() => import("./pages/AdminUsers"), "AdminUsers");
const Boards = lazyPage(() => import("./pages/Boards"), "Boards");
const CheckIn = lazyPage(() => import("./pages/CheckIn"), "CheckIn");
const BrandLogos = lazyPage(() => import("./pages/BrandLogos"), "BrandLogos");
const AdminReports = lazyPage(() => import("./pages/AdminReports"), "AdminReports");
const Health = lazyPage(() => import("./pages/Health"), "Health");
const Privacy = lazyPage(() => import("./pages/Legal"), "Privacy");
const Terms = lazyPage(() => import("./pages/Legal"), "Terms");
const DietCheck = lazyPage(() => import("./pages/DietCheck"), "DietCheck");
const Explore = lazyPage(() => import("./pages/Explore"), "Explore");
const Group = lazyPage(() => import("./pages/Group"), "Group");
const Groups = lazyPage(() => import("./pages/Groups"), "Groups");
const Invite = lazyPage(() => import("./pages/Invite"), "Invite");
const Join = lazyPage(() => import("./pages/Join"), "Join");
const LogIn = lazyPage(() => import("./pages/LogIn"), "LogIn");
const NewGroup = lazyPage(() => import("./pages/NewGroup"), "NewGroup");
const Profile = lazyPage(() => import("./pages/Profile"), "Profile");
const Settings = lazyPage(() => import("./pages/Settings"), "Settings");
const AllSnacks = lazyPage(() => import("./pages/AllSnacks"), "AllSnacks");
const TriedSnacks = lazyPage(() => import("./pages/TriedSnacks"), "TriedSnacks");
const Review = lazyPage(() => import("./pages/Review"), "Review");
const SignUp = lazyPage(() => import("./pages/SignUp"), "SignUp");
const Welcome = lazyPage(() => import("./pages/Welcome"), "Welcome");
const Snack = lazyPage(() => import("./pages/Snack"), "Snack");

const pageLoading = <p className="muted page">Loading…</p>;

/** Fetch every page's file while the phone is otherwise idle. */
function preloadPages() {
  const run = () => pageLoaders.forEach((load) => load().catch(() => {}));
  if ("requestIdleCallback" in window) requestIdleCallback(run, { timeout: 3000 });
  else setTimeout(run, 1500);
}

interface Toast {
  title: string;
  body: string;
}

export function App() {
  const path = usePath();
  // Start from who was signed in last time on this phone (lib/snapshot.ts), so
  // the app draws at once; /me then confirms it. undefined = still loading.
  const [me, setMe] = useState<Me | null | undefined>(() => readSnapshot<Me>("me") ?? undefined);
  const [devLogin, setDevLogin] = useState(false);
  const [quickSignIn, setQuickSignIn] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [seenWelcome, setSeenWelcome] = useState(welcomed);

  const refreshMe = useCallback(async () => {
    const { user, devLogin, quickSignIn } = await api<{ user: Me | null; devLogin?: boolean; quickSignIn?: boolean }>(
      "/me",
    );
    setMe(user);
    if (user) {
      rememberAccount(user.username);
      writeSnapshot("me", user);
    } else clearSnapshots(); // signed out, or the session ran out
    setDevLogin(devLogin === true);
    setQuickSignIn(quickSignIn === true);
  }, []);

  useEffect(() => {
    const check = () =>
      refreshMe().catch(() => {
        // No signal (or a server hiccup): keep showing the last-seen copy.
        // With no copy, fall back to the signed-out page as before.
        setMe((prev) => prev ?? null);
      });
    check();
    // Signal back: check again so the points and badges are current.
    window.addEventListener("online", check);
    return () => window.removeEventListener("online", check);
  }, [refreshMe]);

  // Lad mode's colours come from CSS keyed on <html data-voice="lad">.
  const voice = me?.voice ?? "grownup";
  useEffect(() => {
    document.documentElement.dataset.voice = voice;
  }, [voice]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  const logOut = async () => {
    await api("/auth/logout", { method: "POST" });
    clearSnapshots();
    setMe(null);
    navigate("/");
  };

  const onSignedIn = async () => {
    await refreshMe();
    // Came from a group invite link before signing in? Carry on to it.
    navigate(readPendingJoin() ?? "/");
  };

  const refresh = () => void refreshMe().catch(() => {});

  // Admins: the to-do count goes on the app icon too, and is kept fresh while the app is open.
  const todo = me ? adminToDo(me) : 0;
  useEffect(() => {
    if (me?.isAdmin) setIconBadge(todo);
  }, [me?.isAdmin, todo]);
  useEffect(() => {
    if (!me?.isAdmin) return;
    const onShow = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onShow);
    const timer = setInterval(refresh, 60_000);
    return () => {
      document.removeEventListener("visibilitychange", onShow);
      clearInterval(timer);
    };
  }, [me?.isAdmin]);
  // Admin pages clear things off the list (opening Users clears "new people"), so recount on the way in.
  const adminPage = /^\/(admin|review|settings)/.test(path);
  useEffect(() => {
    if (me?.isAdmin && adminPage) setTimeout(refresh, 1500);
  }, [path]);

  // Signed in: fetch the other pages' files in the background (see lazyPage).
  useEffect(() => {
    if (me?.id) preloadPages();
  }, [me?.id]);

  // Already allowed notifications on this phone? Make sure they're actually on
  // for whoever is signed in (no tap needed: the phone already said yes).
  useEffect(() => {
    if (me?.id) keepPushOn().catch(() => {});
  }, [me?.id]);

  if (me === undefined) return <p className="muted page">Loading…</p>;

  // Signed out: the welcome page, sign-up and log-in, without the tab bar.
  if (!me) {
    let page;
    if (path === "/privacy") page = <Privacy />;
    else if (path === "/terms") page = <Terms />;
    else if (quickSignIn) {
      // Testing mode: one name-and-PIN form instead of sign-up and log-in.
      if (path.startsWith("/join/")) savePendingJoin(path);
      page = (
        <>
          <Home quick />
          <QuickSignIn onSignedIn={onSignedIn} />
        </>
      );
    } else if (path === "/signup") page = <SignUp onSignedIn={onSignedIn} />;
    else if (path === "/login") page = <LogIn onSignedIn={onSignedIn} />;
    else {
      if (path.startsWith("/join/")) savePendingJoin(path);
      page = <Home />;
    }
    return (
      <div className="app">
        <header className="topbar">
          <Link href="/" className="brand">
            <img src="/logo.svg" alt="" width={32} height={32} />
            <span>crunchd</span>
          </Link>
          <nav className={quickSignIn ? "hidden" : "row"}>
            <Link href="/login">Log in</Link>
            <Link href="/signup" className="button small">
              Join
            </Link>
          </nav>
        </header>
        <main>
          <Suspense fallback={pageLoading}>{page}</Suspense>
        </main>
      </div>
    );
  }

  // Signed in but not picked lad or grown-up mode yet: ask before anything else.
  if (me.voice === null) {
    return (
      <div className="app">
        <header className="topbar">
          <span className="brand">
            <img src="/logo.svg" alt="" width={32} height={32} />
            <span>crunchd</span>
          </span>
        </header>
        <main>
          <PickVoice me={me} onChanged={refreshMe} />
        </main>
      </div>
    );
  }

  // First time on this device: say hello and show how to add it to the home screen.
  if (!seenWelcome) {
    return (
      <VoiceProvider voice={voice}>
        <div className="app">
          <main>
            <Suspense fallback={pageLoading}>
              <Welcome
                me={me}
                onDone={() => {
                  markWelcomed();
                  setSeenWelcome(true);
                }}
              />
            </Suspense>
          </main>
        </div>
      </VoiceProvider>
    );
  }

  // Signed in: the app shell with the bottom tab bar.
  const snackId = matchPath("/snack/", path);
  const groupId = path === "/groups/new" ? null : matchPath("/groups/", path);
  const inviteGroupId = path.match(/^\/groups\/([^/]+)\/invite$/)?.[1] ?? null;
  const editGroupId = path.match(/^\/groups\/([^/]+)\/edit$/)?.[1] ?? null;
  const triedBy = path === "/me/snacks" ? me.username : (() => {
    const m = path.match(/^\/u\/([^/]+)\/snacks$/)?.[1];
    return m ? decodeURIComponent(m) : null;
  })();
  const joinCode = matchPath("/join/", path);
  const profileName = path === "/me" ? me.username : matchPath("/u/", path);

  let page;
  let title = "crunchd";
  let tab = "";
  if (path === "/") {
    tab = "/";
    page = <Feed me={me} onChanged={refresh} />;
  } else if (path === "/checkin") {
    tab = "/checkin";
    title = window.location.search.includes("edit=") ? "Edit check-in" : line(voice, "title.checkin");
    page = (
      <CheckIn
        key={window.location.search}
        editId={new URLSearchParams(window.location.search).get("edit") ?? undefined}
        username={me.username}
        onSaved={(photoPending) => {
          setToast({ title: "Saved", body: photoPending ? "Your new photo shows once it's approved." : "Your check-in is updated." });
          refresh();
          history.back();
        }}
        onDone={(name, points, withPhoto) => {
          const photoNote = withPhoto ? " Your photo shows once it's approved." : "";
          const checkedIn = line(voice, "toast.checkedIn");
          setToast({ title: points > 0 ? `+${points} pts` : checkedIn, body: `${line(voice, "toast.onBoard", { vars: { name } })}${photoNote}` });
          refresh();
          navigate("/");
          // Sometimes the Golden Crisp flutters over the feed afterwards: wait
          // until the feed is showing so it isn't missed during the page change.
          setTimeout(() => maybeReleaseGoldenCrisp("checkin"), 1500);
        }}
      />
    );
  } else if (path === "/boards") {
    tab = "/boards";
    title = line(voice, "title.boards");
    page = <Boards me={me} />;
  } else if (path === "/explore") {
    tab = "/explore";
    title = line(voice, "title.explore");
    page = <Explore />;
  } else if (path === "/groups") {
    tab = "/groups";
    title = line(voice, "title.groups");
    page = <Groups />;
  } else if (path === "/groups/new") {
    title = line(voice, "title.newGroup");
    page = <NewGroup />;
  } else if (editGroupId) {
    title = line(voice, "title.editGroup");
    page = <NewGroup key={editGroupId} editId={editGroupId} />;
  } else if (inviteGroupId) {
    title = "Invite";
    page = <Invite id={inviteGroupId} />;
  } else if (groupId) {
    title = line(voice, "title.group");
    page = <Group id={groupId} me={me} />;
  } else if (joinCode) {
    title = "Join a group";
    page = <Join code={joinCode} />;
  } else if (triedBy) {
    const mine = triedBy.toLowerCase() === me.username.toLowerCase();
    tab = mine ? "/me" : "";
    title = mine ? "Your snacks" : `${triedBy}'s snacks`;
    page = <TriedSnacks username={triedBy} isMe={mine} />;
  } else if (path === "/cotw") {
    title = "Crisp of the Week";
    page = <Cotw me={me} />;
  } else if (path === "/snacks") {
    title = "All snacks";
    page = <AllSnacks />;
  } else if (path === "/settings") {
    title = "Settings";
    page = <Settings me={me} onChanged={refreshMe} />;
  } else if (path === "/brands" && me.isAdmin) {
    title = "Brand logos";
    page = <BrandLogos />;
  } else if (path === "/welcome") {
    title = "Welcome";
    page = <Welcome me={me} onDone={() => navigate("/")} />;
  } else if (path === "/admin/diet" && me.isAdmin) {
    title = "Diet check";
    page = <DietCheck />;
  } else if (path === "/admin/users" && me.isAdmin) {
    title = "Users";
    page = <AdminUsers meId={me.id} />;
  } else if (path === "/admin/snacks" && me.isAdmin) {
    title = "Snacks";
    page = <AdminSnacks onChanged={refreshMe} />;
  } else if (path === "/privacy") {
    title = "Privacy";
    page = <Privacy />;
  } else if (path === "/terms") {
    title = "Terms";
    page = <Terms />;
  } else if (path === "/admin/reports" && me.isAdmin) {
    title = "Reports and requests";
    page = <AdminReports onChanged={refresh} />;
  } else if (path === "/admin/health" && me.isAdmin) {
    title = "Health";
    page = <Health />;
  } else if (path === "/review" && me.isAdmin) {
    title = "Approvals";
    page = <Review onChanged={refresh} />;
  } else if (snackId) {
    page = <Snack id={snackId} me={me} />;
  } else if (profileName) {
    tab = profileName.toLowerCase() === me.username.toLowerCase() ? "/me" : "";
    page = <Profile username={profileName} me={me} devLogin={devLogin} onLogOut={logOut} onChanged={refresh} />;
  } else {
    page = <ComingSoon title="Page not found">That link doesn't go anywhere.</ComingSoon>;
  }
  const showBack = !tab;

  return (
    <VoiceProvider voice={voice}>
      <div className="shell">
        <header className="appbar">
          <div className="row">
            {showBack && (
              <button type="button" className="icon-button" aria-label="Back" onClick={() => history.back()}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
                  strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
            )}
            <Link href="/" className="brand">
              <img src={voice === "lad" ? "/logo-lad.svg" : "/logo.svg"} alt="" width={32} height={32} />
              <span>{title}</span>
            </Link>
          </div>
          <div className="row">
            {devLogin && (
              <span className="dev-badge" title="Dev login is on: everyone with the link is signed in as this user">
                dev
              </span>
            )}
            <Link href="/me" className="points-pill">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--orange-dark)" strokeWidth="2.4"
                strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z" />
                <path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" />
              </svg>
              {me.points} pts
            </Link>
          </div>
        </header>
        <main className="shell-main">
          <VerifyNotice me={me} />
          {/* A key per address, so a page still loading doesn't hold up the next one. */}
          <Suspense key={path} fallback={pageLoading}>
            {page}
          </Suspense>
        </main>
        {toast && (
          <div className="toast" role="status">
            <span className="grow">
              <b>{toast.title}</b>
              <br />
              {toast.body}
            </span>
            <button type="button" className="icon-button" aria-label="Dismiss" onClick={() => setToast(null)}>
              ×
            </button>
          </div>
        )}
        <PushPrompt me={me} path={path} />
        <GoldenCrisp />
        <TabBar active={tab} meBadge={adminToDo(me)} />
      </div>
    </VoiceProvider>
  );
}

const PENDING_JOIN = "snackchat.pendingJoin";

function savePendingJoin(path: string) {
  try {
    sessionStorage.setItem(PENDING_JOIN, path);
  } catch {
    // Private browsing can block storage; they'll just land on the feed.
  }
}

function readPendingJoin(): string | null {
  try {
    const path = sessionStorage.getItem(PENDING_JOIN);
    sessionStorage.removeItem(PENDING_JOIN);
    return path;
  } catch {
    return null;
  }
}
