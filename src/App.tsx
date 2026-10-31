import { useCallback, useEffect, useState } from "react";
import { rememberAccount } from "./lib/ref";
import { adminToDo, api, type Me } from "./api";
import { Link } from "./components/Link";
import { TabBar } from "./components/TabBar";
import { matchPath, navigate, usePath } from "./router";
import { AdminSnacks } from "./pages/AdminSnacks";
import { AdminUsers } from "./pages/AdminUsers";
import { Boards } from "./pages/Boards";
import { CheckIn } from "./pages/CheckIn";
import { ComingSoon } from "./pages/ComingSoon";
import { BrandLogos } from "./pages/BrandLogos";
import { AdminReports } from "./pages/AdminReports";
import { Health } from "./pages/Health";
import { Privacy, Terms } from "./pages/Legal";
import { DietCheck } from "./pages/DietCheck";
import { Explore } from "./pages/Explore";
import { Feed } from "./pages/Feed";
import { Group } from "./pages/Group";
import { Groups } from "./pages/Groups";
import { Home, VerifyNotice } from "./pages/Home";
import { Invite } from "./pages/Invite";
import { Join } from "./pages/Join";
import { LogIn } from "./pages/LogIn";
import { NewGroup } from "./pages/NewGroup";
import { Profile } from "./pages/Profile";
import { QuickSignIn } from "./pages/QuickSignIn";
import { Settings } from "./pages/Settings";
import { AllSnacks } from "./pages/AllSnacks";
import { TriedSnacks } from "./pages/TriedSnacks";
import { Review } from "./pages/Review";
import { SignUp } from "./pages/SignUp";
import { Welcome } from "./pages/Welcome";
import { Snack } from "./pages/Snack";
import { PickVoice } from "./pages/PickVoice";
import { markWelcomed, welcomed } from "./lib/install";
import { keepPushOn, setIconBadge } from "./lib/push";
import { PushPrompt } from "./components/PushPrompt";
import { VoiceProvider } from "./lib/voice";
import { line } from "../shared/voice";

interface Toast {
  title: string;
  body: string;
}

export function App() {
  const path = usePath();
  const [me, setMe] = useState<Me | null | undefined>(undefined); // undefined = still loading
  const [devLogin, setDevLogin] = useState(false);
  const [quickSignIn, setQuickSignIn] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [seenWelcome, setSeenWelcome] = useState(welcomed);

  const refreshMe = useCallback(async () => {
    const { user, devLogin, quickSignIn } = await api<{ user: Me | null; devLogin?: boolean; quickSignIn?: boolean }>(
      "/me",
    );
    setMe(user);
    if (user) rememberAccount(user.username);
    setDevLogin(devLogin === true);
    setQuickSignIn(quickSignIn === true);
  }, []);

  useEffect(() => {
    refreshMe().catch(() => setMe(null));
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
        <main>{page}</main>
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
            <Welcome
              me={me}
              onDone={() => {
                markWelcomed();
                setSeenWelcome(true);
              }}
            />
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
          {page}
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
