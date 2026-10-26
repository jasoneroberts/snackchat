import { Link } from "../components/Link";

// The privacy policy and terms, in plain English. Written for Crunchd as it
// is now: a UK app for friends and family, run by one person. Have them
// checked before a public launch, and update "Last updated" when they change.

const UPDATED = "25 October 2026";
// How to reach whoever runs Crunchd. Change this once there's a contact email.
const CONTACT = "message @jase in the app, or ask the person who invited you";

export function Privacy() {
  return (
    <article className="page stack legal">
      <h1 className="title">Privacy policy</h1>
      <p className="small muted">Last updated {UPDATED}</p>
      <p>
        Crunchd is a small app for rating snacks with friends. This page says what we keep about you, why, who else
        handles it, and how to get a copy or delete it. To ask anything about your data, {CONTACT}.
      </p>

      <h2>What we keep</h2>
      <ul>
        <li>
          <b>Your account:</b> your name, your PIN or password (stored scrambled, so nobody can read it), your email
          address if you gave one, your country, and your settings such as lad mode.
        </li>
        <li>
          <b>What you post:</b> check-ins, star ratings, sliders, reviews, where you had it and what with, photos,
          your profile picture, snacks you add, and groups you start or join.
        </li>
        <li>
          <b>What you do in the app:</b> points, badges, snacks you save or skip in Explore, your taste preferences,
          people you block, and anything you report.
        </li>
        <li>
          <b>Technical bits:</b> a cookie that keeps you signed in, and some settings stored on your phone (like
          whether you've seen the welcome page). If the app crashes we keep the error, the page you were on and your
          browser type, so we can fix it. Your IP address is used to stop people spamming sign-ins. It isn't saved in
          Crunchd's database, though Cloudflare's own logs, kept for a few days, may include it.
        </li>
      </ul>
      <p>
        There are no adverts, no tracking cookies and no selling of data. The sign-in cookie is needed for the app to
        work, so there's no cookie banner.
      </p>

      <h2>Why (the legal bit)</h2>
      <p>
        We use your account and posts to run the app you signed up for (that's "performing a contract" under UK GDPR).
        We keep error reports, rate limits and backups because we have a "legitimate interest" in keeping the app safe
        and working.
      </p>

      <h2>Who can see what</h2>
      <p>
        Everyone signed in can see your name, profile picture, check-ins, reviews and photos, except people you've
        blocked. Photos and profile pictures are checked by an admin before anyone else sees them. Admins can
        see everything in the app, to keep it safe.
      </p>

      <h2>Who else handles it</h2>
      <ul>
        <li>
          <b>Cloudflare</b> runs the app and stores the data and photos. It's a US company, so data may be handled
          outside the UK, under its standard data protection terms.
        </li>
        <li>
          <b>Resend</b> sends our emails, once email is switched on. It only gets your email address and the message.
        </li>
        <li>
          <b>Open Food Facts</b> and <b>Wikimedia</b> are looked up for diet labels and maker logos. Only snack and
          maker names are sent, never anything about you.
        </li>
      </ul>

      <h2>How long we keep it</h2>
      <p>
        Until you delete your account. Nightly backups are kept for 14 days, so deleted things are fully gone two weeks
        later. Error reports and admin records are cleared after 90 days.
      </p>

      <h2>Your rights</h2>
      <p>You can:</p>
      <ul>
        <li>
          <b>Get a copy</b> of everything: Settings, then Download my data.
        </li>
        <li>
          <b>Delete your account</b> and everything in it: Settings, then Delete my account.
        </li>
        <li>
          <b>Fix</b> anything that's wrong, or <b>object</b> to how we use your data: {CONTACT}.
        </li>
      </ul>
      <p>
        If you're unhappy with how we handle your data you can complain to the Information Commissioner's Office at{" "}
        <a href="https://ico.org.uk/make-a-complaint/" target="_blank" rel="noreferrer">
          ico.org.uk
        </a>
        .
      </p>

      <h2>Age</h2>
      <p>You need to be 13 or over to use Crunchd.</p>

      <p className="small muted">
        See also the <Link href="/terms">terms</Link>.
      </p>
    </article>
  );
}

export function Terms() {
  return (
    <article className="page stack legal">
      <h1 className="title">Terms</h1>
      <p className="small muted">Last updated {UPDATED}</p>
      <p>By using Crunchd you agree to these terms. They're short, so please read them.</p>

      <h2>Be decent</h2>
      <ul>
        <li>Rate snacks honestly. Have a laugh, but don't be hateful, bullying, sexual or threatening.</li>
        <li>Only post photos you took, and keep people's faces out of them unless they're happy to be in.</li>
        <li>No spam, adverts or fake accounts. One account each.</li>
        <li>You need to be 13 or over.</li>
      </ul>
      <p>
        If something breaks these rules, tap Report. We can remove anything, and suspend or delete any account, if we
        think it breaks them.
      </p>

      <h2>Your posts</h2>
      <p>
        What you post is still yours. By posting it you let Crunchd show it in the app (on boards, snack pages,
        Explore and so on) for as long as it's up. Delete it, or your account, and it goes.
      </p>

      <h2>Diet labels and allergies</h2>
      <p>
        <b>Always check the pack.</b> Vegan and gluten-free labels in Crunchd are a guide, checked by hand from public
        information, and recipes change. Never rely on Crunchd for an allergy.
      </p>

      <h2>Brands</h2>
      <p>
        Snack names, brand names and logos belong to their owners and are used only to say which snack is which.
        Crunchd isn't connected to or approved by any snack maker.
      </p>

      <h2>No promises</h2>
      <p>
        Crunchd is a free hobby app, provided as it is. We try to keep it running and your data safe, but we can't
        promise it'll always be available or error-free, and we can change or close it. Nothing in these terms limits
        your rights under UK consumer law.
      </p>

      <h2>Changes</h2>
      <p>If these terms change, we'll update the date at the top and say so in the app if it's a big change.</p>

      <p>These terms are governed by the law of England and Wales.</p>

      <p className="small muted">
        Questions? {CONTACT[0].toUpperCase() + CONTACT.slice(1)}. See also the <Link href="/privacy">privacy policy</Link>.
      </p>
    </article>
  );
}
