import { useState } from "react";
import axios from "axios";

import axios from "axios";

const API = "http://localhost:5173/api";

const handleSubmit = async (e) => {
  e.preventDefault();

  try {
    await axios.post(`${API}/auth/signup`, form);
    alert("User created!");
  } catch (err) {
    console.error(err);
  }
};
export default function Signup() {
  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
    role: "user"
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    await axios.post("/api/auth/signup", form);
    alert("User created!");
  };

  return (
    <form onSubmit={handleSubmit}>
      <input placeholder="Username" onChange={e => setForm({...form, username: e.target.value})} />
      <input placeholder="Email" onChange={e => setForm({...form, email: e.target.value})} />
      <input type="password" placeholder="Password" onChange={e => setForm({...form, password: e.target.value})} />

      <select onChange={e => setForm({...form, role: e.target.value})}>
        <option value="user">User</option>
        <option value="admin">Admin</option>
      </select>

      <button type="submit">Sign Up</button>
    </form>
  );
}
