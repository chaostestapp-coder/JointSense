import { Link } from "react-router";

export default function NotFoundPage() {
  return (
    <div className="bg-surface border border-border rounded-sm p-8 space-y-3">
      <h1 className="text-xl font-semibold text-foreground">Page not found</h1>
      <p className="text-sm text-secondary">
        The requested clinical view could not be located.
      </p>
      <Link
        to="/"
        className="link-button inline-flex items-center px-4 py-2 text-sm font-medium bg-accent hover:bg-accent-hover text-accent-foreground rounded-[4px]"
      >
        Return to dashboard
      </Link>
    </div>
  );
}
