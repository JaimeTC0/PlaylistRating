import { useState } from "react";
import axios from "axios";

import axios from "axios";

const API = "http://localhost:5176/api";

const handleSubmit = async (e) => {
  e.preventDefault();

  try {
    const res = await axios.post(`${API}/auth/login`, form);

    localStorage.setItem("token", res.data.token);
    localStorage.setItem("role", res.data.role);

    window.location.href = "/";
  } catch (err) {
    console.error(err);
  }
};
export default function Login() {
  const [form, setForm] = useState({
    email: "",
    password: ""
  });

  const handleSubmit = async (e) => {
    e.preventDefault();

    const res = await axios.post("/api/auth/login", form);

    localStorage.setItem("token", res.data.token);
    localStorage.setItem("role", res.data.role);

    alert("Logged in!");
  };

  return (
    <form onSubmit={handleSubmit}>
      <input placeholder="Email" onChange={e => setForm({...form, email: e.target.value})} />
      <input type="password" placeholder="Password" onChange={e => setForm({...form, password: e.target.value})} />
      <button type="submit">Login</button>
    </form>
  );
}
