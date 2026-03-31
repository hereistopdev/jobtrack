import InterviewScheduleCell from "./InterviewScheduleCell";
import { colorsForUser, fullAddedByTitle, shortAddedByName } from "../utils/userDisplay";

function SortTh({ id, label, sortKey, sortDir, onSort, className }) {
  const active = sortKey === id;
  return (
    <th
      scope="col"
      className={className}
      aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button type="button" className="sortable-heading" onClick={() => onSort(id)}>
        <span>{label}</span>
        <span className="sort-indicator" aria-hidden>
          {active ? (sortDir === "asc" ? "▲" : "▼") : ""}
        </span>
      </button>
    </th>
  );
}

function JobTable({
  items,
  totalLinksCount = 0,
  rowNumberOffset = 0,
  currentUser,
  canModifyRow,
  onEdit,
  onDelete,
  onAddInterview,
  onRemoveInterview,
  sortKey,
  sortDir,
  onSort,
  title = "Team Job Links",
  headerExtra = null
}) {
  const sortable = typeof onSort === "function" && sortKey != null && sortDir != null;

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
      <div className="table-card-head-row">
        <h2 className="table-card-title">{title}</h2>
        {headerExtra}
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th className="col-num" scope="col">
                #
              </th>
              {sortable ? (
                <>
                  <SortTh id="company" label="Company" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className="th-company" />
                  <SortTh id="title" label="Role" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className="th-role" />
                  <SortTh id="country" label="Country" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className="th-country" />
                  <SortTh id="link" label="Link" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className="th-link" />
                  <SortTh id="date" label="Date" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className="th-date" />
                  <SortTh id="status" label="Status" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className="th-status" />
                  <SortTh
                    id="interviews"
                    label="Interviews"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSort}
                    className="th-interviews"
                  />
                  <SortTh id="addedBy" label="Added by" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className="th-by" />
                  <SortTh id="notes" label="Notes" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className="th-notes" />
                </>
              ) : (
                <>
                  <th className="th-company" scope="col">
                    Company
                  </th>
                  <th className="th-role" scope="col">
                    Role
                  </th>
                  <th className="th-country" scope="col">
                    Country
                  </th>
                  <th className="th-link" scope="col">
                    Link
                  </th>
                  <th className="th-date" scope="col">
                    Date
                  </th>
                  <th className="th-status" scope="col">
                    Status
                  </th>
                  <th className="th-interviews" scope="col">
                    Interviews
                  </th>
                  <th className="th-by" scope="col">
                    Added by
                  </th>
                  <th className="th-notes" scope="col">
                    Notes
                  </th>
                </>
              )}
              <th className="th-actions" scope="col">
                Actions
              </th>
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
