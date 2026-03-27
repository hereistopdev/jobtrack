function ownerId(job) {
  const cb = job?.createdBy;
  if (!cb) return null;
  if (typeof cb === "object" && cb._id) return cb._id.toString();
  return cb.toString();
}

export function canModifyJobLink(job, user) {
  if (!user?.id) return false;
  if (user.role === "admin") return true;
  const oid = ownerId(job);
  if (!oid) return false;
  return oid === user.id;
}
