import InterviewScheduleCell from "./InterviewScheduleCell";
import { colorsForUser, fullAddedByTitle, shortAddedByName } from "../utils/userDisplay";

function JobTable({
  items,
  totalLinksCount = 0,
  rowNumberOffset = 0,
  currentUser,
  canModifyRow,
  onEdit,
  onDelete,
  onAddInterview,
  onRemoveInterview
}) {
  if (!items.length) {
    if (totalLinksCount > 0) {
      return (
        <div className="card empty-state">
          <p>No job links match your search, role filter, or date filters. Try adjusting filters.</p>
        </div>
      );
    }
    return (
      <div className="card empty-state">
        <p>No job links yet. Add one from the form above.</p>
      </div>
    );
  }

  return (
    <div className="card table-card">
      <h2 className="table-card-title">Team Job Links</h2>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th className="col-num" scope="col">
                #
              </th>
              <th className="th-company">Company</th>
              <th className="th-role">Role</th>
              <th className="th-country">Country</th>
              <th className="th-link">Link</th>
              <th className="th-date">Date</th>
              <th className="th-status">Status</th>
              <th className="th-interviews">Interviews</th>
              <th className="th-by">Added by</th>
              <th className="th-notes">Notes</th>
              <th className="th-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => {
              const canEdit = canModifyRow(item, currentUser);
              const creator = item.createdBy;
              const shortName = shortAddedByName(creator);
              const titleFull = fullAddedByTitle(creator);
              const palette = colorsForUser(creator);
              return (
                <tr key={item._id}>
                  <td className="col-num">{rowNumberOffset + index + 1}</td>
                  <td className="cell-ellipsis" title={item.company}>
                    {item.company}
                  </td>
                  <td className="cell-ellipsis cell-role" title={item.title}>
                    {item.title}
                  </td>
                  <td className="cell-ellipsis cell-narrow" title={item.country || ""}>
                    {item.country || "—"}
                  </td>
                  <td className="cell-link">
                    <a href={item.link} target="_blank" rel="noreferrer">
                      Open
                    </a>
                  </td>
                  <td className="cell-date">{new Date(item.date).toLocaleDateString()}</td>
                  <td className="cell-status">{item.status}</td>
                  <td className="cell-interviews">
                    <InterviewScheduleCell
                      item={item}
                      canEdit={canEdit}
                      onAddInterview={onAddInterview}
                      onRemoveInterview={onRemoveInterview}
                    />
                  </td>
                  <td className="cell-by cell-by-chip">
                    {creator && typeof creator === "object" ? (
                      <span
                        className="user-attribution-chip"
                        style={{
                          backgroundColor: palette.bg,
                          color: palette.fg,
                          borderColor: palette.border
                        }}
                        title={titleFull || shortName}
                      >
                        {shortName}
                      </span>
                    ) : (
                      <span className="muted-text">—</span>
                    )}
                  </td>
                  <td className="cell-ellipsis cell-notes" title={item.notes || ""}>
                    {item.notes || "-"}
                  </td>
                  <td className="cell-actions">
                    {canEdit ? (
                      <div className="row-actions">
                        <button
                          type="button"
                          className="icon-btn"
                          title="Edit"
                          aria-label="Edit job link"
                          onClick={() => onEdit(item)}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          className="icon-btn icon-btn-danger"
                          title="Delete"
                          aria-label="Delete job link"
                          onClick={() => onDelete(item._id)}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            <line x1="10" y1="11" x2="10" y2="17" />
                            <line x1="14" y1="11" x2="14" y2="17" />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <span className="muted-text">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default JobTable;
