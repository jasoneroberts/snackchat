export function ComingSoon({ title, children }: { title: string; children: string }) {
  return (
    <div className="page">
      <div className="empty">
        <h2>{title}</h2>
        <p className="muted">{children}</p>
      </div>
    </div>
  );
}
