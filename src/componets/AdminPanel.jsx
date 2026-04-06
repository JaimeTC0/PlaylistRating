import { useEffect, useState } from "react";
import "./AdminPanel.css";

const API_BASE = "http://localhost:8080";

function authHeaders() {
  const token = localStorage.getItem("token") || "";
  return {
    "Content-Type": "application/json",
    Authorization: token,
  };
}

export default function AdminPanel() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [newUser, setNewUser] = useState({
    username: "",
    email: "",
    password: "",
    role: "user",
  });

  async function loadUsers() {
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API_BASE}/admin/users`, {
        headers: {
          Authorization: localStorage.getItem("token") || "",
        },
      });

      if (!res.ok) throw new Error("Failed to load users");
      const data = await res.json();
      setUsers(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message || "Unable to load users");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  const showMessage = (text) => {
    setMessage(text);
    window.clearTimeout(showMessage.timer);
    showMessage.timer = window.setTimeout(() => setMessage(""), 2200);
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setError("");

    try {
      const res = await fetch(`${API_BASE}/admin/users`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(newUser),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to create user");

      setUsers((prev) => [data, ...prev]);
      setNewUser({ username: "", email: "", password: "", role: "user" });
      showMessage("User created");
    } catch (e) {
      setError(e.message || "Could not create user");
    }
  };

  const handleRoleChange = async (userId, role) => {
    setError("");

    try {
      const res = await fetch(`${API_BASE}/admin/users/${userId}`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ role }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to update user");

      setUsers((prev) => prev.map((u) => (u._id === userId ? data : u)));
      showMessage("User updated");
    } catch (e) {
      setError(e.message || "Could not update user");
    }
  };

  const handleDeleteUser = async (userId) => {
    setError("");

    try {
      const res = await fetch(`${API_BASE}/admin/users/${userId}`, {
        method: "DELETE",
        headers: {
          Authorization: localStorage.getItem("token") || "",
        },
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to delete user");

      setUsers((prev) => prev.filter((u) => u._id !== userId));
      showMessage("User deleted");
    } catch (e) {
      setError(e.message || "Could not delete user");
    }
  };

  return (
    <section className="admin-page">
      <div className="admin-top">
        <h1 className="admin-title">Administrator Panel</h1>
        <p className="admin-sub">Manage application users and access levels.</p>
      </div>

      <div className="admin-layout">
        <div className="admin-card">
          <h2>Create User</h2>
          <form className="admin-form" onSubmit={handleCreateUser}>
            <input
              type="text"
              placeholder="Username"
              value={newUser.username}
              onChange={(e) => setNewUser((p) => ({ ...p, username: e.target.value }))}
              required
            />
            <input
              type="email"
              placeholder="Email"
              value={newUser.email}
              onChange={(e) => setNewUser((p) => ({ ...p, email: e.target.value }))}
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={newUser.password}
              onChange={(e) => setNewUser((p) => ({ ...p, password: e.target.value }))}
              required
            />
            <select
              value={newUser.role}
              onChange={(e) => setNewUser((p) => ({ ...p, role: e.target.value }))}
            >
              <option value="user">Standard User</option>
              <option value="admin">Administrator</option>
            </select>
            <button type="submit">Create</button>
          </form>
        </div>

        <div className="admin-card">
          <h2>Users</h2>
          {loading ? (
            <p className="admin-muted">Loading users...</p>
          ) : (
            <div className="admin-users">
              {users.map((u) => (
                <div key={u._id} className="admin-user-row">
                  <div className="admin-user-meta">
                    <p className="admin-user-name">{u.username}</p>
                    <p className="admin-user-email">{u.email}</p>
                  </div>
                  <select
                    value={u.role || "user"}
                    onChange={(e) => handleRoleChange(u._id, e.target.value)}
                    className="admin-role"
                  >
                    <option value="user">Standard</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button
                    className="admin-delete"
                    onClick={() => handleDeleteUser(u._id)}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {error && <p className="admin-error">{error}</p>}
      {message && <p className="admin-message">{message}</p>}
    </section>
  );
}
