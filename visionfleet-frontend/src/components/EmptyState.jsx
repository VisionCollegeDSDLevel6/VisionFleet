import Icon from "./Icon";

export default function EmptyState({ icon, title, description }) {
  return (
    <div className="vf-empty-state">
      <div className="vf-empty-icon">
        <Icon name={icon} size={25} />
      </div>
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}
