function JobTable({ items, onEdit, onDelete }) {
  if (!items.length) {
    return (
      <div className="card empty-state">
        <p>No job links yet. Add one from the form above.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h2>Team Job Links</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Company</th>
              <th>Title</th>
              <th>Link</th>
              <th>Date</th>
              <th>Status</th>
              <th>Notes</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item._id}>
                <td>{item.company}</td>
                <td>{item.title}</td>
                <td>
                  <a href={item.link} target="_blank" rel="noreferrer">
                    Open
                  </a>
                </td>
                <td>{new Date(item.date).toLocaleDateString()}</td>
                <td>{item.status}</td>
                <td>{item.notes || "-"}</td>
                <td>
                  <button className="small" onClick={() => onEdit(item)}>
                    Edit
                  </button>
                  <button className="small danger" onClick={() => onDelete(item._id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default JobTable;
