import Icon from "./Icon";

export default function StatCard({ title, description, icon, value = null }) {
  return (
    <article className="vf-metric-card">
      <div className="vf-metric-top">
        <span className="vf-metric-icon">
          <Icon name={icon} size={21} />
        </span>
        <span className="vf-metric-dash">{value ?? "—"}</span>
      </div>

      <div className="vf-metric-text">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    </article>
  );
}
