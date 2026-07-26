export function AdminFooter() {
  const env = process.env.NODE_ENV === "production" ? "production" : "development";
  return (
    <footer className="admin-footer">
      <span>CorePilot Admin · v0.1.0</span>
      <span className={`admin-env admin-env--${env}`}>{env}</span>
      <span>© {new Date().getFullYear()} CoreWital</span>
    </footer>
  );
}
