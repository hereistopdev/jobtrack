const PAGE_SIZES = [25, 50, 100, 200];

function PaginationBar({
  page,
  pageSize,
  totalFound,
  totalPages,
  totalInBoard,
  onPageChange,
  onPageSizeChange
}) {
  const start = totalFound === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalFound);
  const canPrev = totalFound > 0 && page > 1;
  const canNext = totalFound > 0 && page < totalPages;

  return (
    <div className="pagination-bar card">
      <p className="pagination-summary">
        <strong>{totalFound}</strong> found
        {totalInBoard !== undefined && (
          <>
            {" "}
            · <span className="pagination-total-board">{totalInBoard} total in board</span>
          </>
        )}
        {totalFound > 0 && (
          <>
            {" "}
            · Showing <strong>{start}</strong>–<strong>{end}</strong> of <strong>{totalFound}</strong>
          </>
        )}
      </p>
      <div className="pagination-controls">
        <label className="pagination-page-size">
          Per page
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            aria-label="Rows per page"
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <div className="pagination-nav">
          <button
            type="button"
            className="muted"
            disabled={!canPrev}
            onClick={() => onPageChange(page - 1)}
            aria-label="Previous page"
          >
            Previous
          </button>
          <span className="pagination-page-label" aria-live="polite">
            Page {totalFound === 0 ? 0 : page} of {totalFound === 0 ? 0 : totalPages}
          </span>
          <button
            type="button"
            className="muted"
            disabled={!canNext}
            onClick={() => onPageChange(page + 1)}
            aria-label="Next page"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

export default PaginationBar;
