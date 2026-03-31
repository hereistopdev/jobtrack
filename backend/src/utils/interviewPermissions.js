function ownerId(record) {
  const cb = record?.createdBy;
  if (!cb) return null;
  if (typeof cb === "object" && cb._id) return cb._id.toString();
  return cb.toString();
}

export function canModifyInterviewRecord(record, user) {
  if (!user?.id) return false;
  if (user.role === "admin") return true;
  const oid = ownerId(record);
  if (!oid) return false;
  return oid === user.id;
}
