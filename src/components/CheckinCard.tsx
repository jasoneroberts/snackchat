import { attributeLabel, attributesFor, getCategory } from "../../shared/catalogue";
import type { FeedItem } from "../../shared/types";
import { rating, timeAgo } from "../lib/format";
import { Avatar } from "./Avatar";
import { Link } from "./Link";
import { Stars } from "./Stars";

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
  // Show sliders in their usual order rather than the order they were saved.
  const chips = attributesFor(item.snack.category).filter((a) => item.attributes[a.key] !== undefined);

  return (
    <article className="checkin">
      <header className="checkin-head">
        <Link href={`/u/${item.username}`} className="plain">
          <Avatar username={item.username} />
        </Link>
        <div className="grow">
          <div>
            <Link href={`/u/${item.username}`} className="plain">
              <b>@{item.username}</b>
            </Link>{" "}
            <span className="muted">checked in</span>
          </div>
          <div className="small muted">
            {timeAgo(item.createdAt)}
            {item.venue && ` · at ${item.venue}`}
          </div>
        </div>
        {item.points > 0 && <span className="points-badge">+{item.points} pts</span>}
      </header>

      <div className="checkin-snack">
        <Link href={`/snack/${item.snack.id}`} className="snack-link">
          {item.snack.name}
        </Link>
        <div className="small muted">
          {[item.snack.brand, category?.name].filter(Boolean).join(" · ")}
          {item.snack.status === "pending" && <span className="tag">new, pending</span>}
        </div>
      </div>

      {item.photoId && (
        <img className="checkin-photo" src={`/api/photos/${item.photoId}`} alt={`Photo of ${item.snack.name}`} loading="lazy" />
      )}

      <div className="checkin-rating">
        <Stars value={item.overall} />
        <b>{rating(item.overall)}</b>
      </div>

      {item.review && <p className="checkin-review">{item.review}</p>}
      {item.pairedWith && <p className="small muted checkin-with">Paired with: {item.pairedWith}</p>}

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
