import EmptyState from "./EmptyState";
import Icon from "./Icon";

export default function ManagementPage({
  eyebrow,
  title,
  description,
  columns,
  icon,
  emptyTitle,
  emptyDescription,
  note,
}) {
  return (
    <div className="vf-feature-page">
      <div className="vf-feature-heading">
        <span className="vf-eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>

      <section className="vf-panel vf-feature-table-panel">
        <div className="vf-panel-header">
          <div>
            <h3>{title}</h3>
            <p>Manage and review records from this workspace.</p>
          </div>
          <span className="vf-api-status">API connection pending</span>
        </div>

        <div className="vf-table-scroll">
          <table className="vf-table">
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column}>{column.toUpperCase()}</th>
                ))}
              </tr>
            </thead>
          </table>
        </div>

        <EmptyState
          icon={icon}
          title={emptyTitle}
          description={emptyDescription}
        />
      </section>

      <div className="vf-info-strip">
        <Icon name="info" size={18} />
        <p>{note}</p>
      </div>
    </div>
  );
}
