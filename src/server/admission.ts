export function createAdmissionBudget(limit = 6, windowMs = 60_000) {
  let admissions: number[] = [];
  return (now = Date.now()): boolean => {
    admissions = admissions.filter((time) => time > now - windowMs);
    if (admissions.length >= limit) return false;
    admissions.push(now);
    return true;
  };
}
