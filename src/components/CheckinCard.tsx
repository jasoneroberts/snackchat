import { useCallback, useState } from "react";
import { attributeLabel, attributesFor, getCategory } from "../../shared/catalogue";
import type { FeedItem } from "../../shared/types";
import { rating, timeAgo } from "../lib/format";
import { useVoice } from "../lib/voice";
import { Avatar } from "./Avatar";
import { Link } from "./Link";
import { PhotoViewer } from "./PhotoViewer";
import { SnackTile } from "./SnackTile";
import { Stars } from "./Stars";

const THUMB = 64; // px

export function CheckinCard({
  item,
  mine,
  onDelete,
}: {
  item: FeedItem;
  mine: boolean;
  onDelete?: (id: string) => void;
}) {
  const category = getCategory(item.snack.category);
  const { t } = useVoice();
  const about = { category: item.snack.category };
  // Show sliders in their usual order rather than the order they were saved.
  const [viewing, setViewing] = useState(false);
  const close = useCallback(() => setViewing(false), []);
  const photoUrl = `/api/photos/${item.photoId}`;
  const chips = attributesFor(item.snack.category).filter((a) => item.attributes[a.key] !== undefined);

  return (
    <article className="checkin">
      <header className="checkin-head">
        <Link href={`/u/${item.username}`} className="plain">
          <Avatar username={item.username} avatarId={item.avatarId} />
        </Link>
        <div className="grow">
          <div>
            <Link href={`/u/${item.username}`} className="plain">
              <b>@{item.username}</b>
            </Link>{" "}
            <span className="muted">{t("card.checkedIn", about)}</span>
          </div>
          <div className="small muted">
            {timeAgo(item.createdAt)}
            {item.venue && ` · ${t("card.at", { ...about, vars: { venue: item.venue } })}`}
          </div>
        </div>
        {item.points > 0 && <span className="points-badge">+{item.points} pts</span>}
      </header>

      <div className="checkin-snack">
        {/* Their photo as a thumbnail that opens full screen, or the snack's brand tile. */}
        {item.photoId ? (
          <button type="button" className="checkin-thumb" aria-label={`Show photo of ${item.snack.name}`} onClick={() => setViewing(true)}>
            <img src={photoUrl} alt="" loading="lazy" />
          </button>
        ) : (
          <SnackTile snack={item.snack} size={THUMB} className="checkin-thumb" />
        )}
        <div className="grow">
          <Link href={`/snack/${item.snack.id}`} className="snack-link">
            {item.snack.name}
          </Link>
          <div className="small muted">
            {[item.snack.brand, category?.name].filter(Boolean).join(" · ")}
            {item.snack.status === "pending" && <span className="tag">new, pending</span>}
            {item.photoPending && <span className="tag">photo awaiting approval</span>}
          </div>
        </div>
      </div>
      {viewing && <PhotoViewer src={photoUrl} alt={`Photo of ${item.snack.name}`} onClose={close} />}

      <div className="checkin-rating">
        <Stars value={item.overall} />
        <b>{rating(item.overall)}</b>
      </div>

      {item.review && <p className="checkin-review">{item.review}</p>}
      {item.pairedWith && <p className="small muted checkin-with">{t("card.pairedWith", { ...about, vars: { with: item.pairedWith } })}</p>}

      {(chips.length > 0 || mine) && (
        <div className="chips">
          {chips.map((a) => (
            <span key={a.key} className="chip">
              {attributeLabel(a.key)} <b>{item.attributes[a.key]}</b>
            </span>
          ))}
          {mine && onDelete && (
            <button
              type="button"
              className="link-button small delete"
              onClick={() => {
                if (confirm(`Delete your check-in of ${item.snack.name}? Its points go too.`)) onDelete(item.id);
              }}
            >
              Delete
            </button>
          )}
        </div>
      )}
    </article>
  );
}
