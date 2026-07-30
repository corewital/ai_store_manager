import { Form, Link } from "@remix-run/react";
import type { AdminUser } from "../../services/admin/auth.server";

type Props = { user: AdminUser };

export function AdminHeader({ user }: Props) {
  return (
    <header className="admin-header">
      <Link to="/admin" className="admin-header__brand">
        <img
          src="/images/Admin_Dashboard_Logo.png"
          alt="CorePilot AI Admin"
          className="admin-header__brand-logo"
        />
      </Link>
      <div className="admin-header__right">
        <Form method="get" action="/admin/installs" className="admin-header__search-form">
          <input
            className="admin-header__search"
            type="search"
            name="q"
            placeholder="Search stores…"
            aria-label="Search stores"
          />
        </Form>
        <Link to="/admin/support-tickets" className="admin-header__bell" title="Tickets">
          ✉
        </Link>
        <div className="admin-header__profile">
          <Link to="/admin/profile" className="admin-header__avatar" title="Profile">
            {(user.name || user.email).slice(0, 1).toUpperCase()}
          </Link>
          <div>
            <Link to="/admin/profile" className="admin-header__name">
              {user.name}
            </Link>
            <div className="admin-header__role">{user.roleSlug}</div>
          </div>
          <Form method="post" action="/admin/logout">
            <button type="submit" className="admin-header__logout">
              Logout
            </button>
          </Form>
        </div>
      </div>
    </header>
  );
}
