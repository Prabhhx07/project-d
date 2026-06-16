import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

function Dashboard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchProfile = async () => {
      const token = localStorage.getItem("token");

      if (!token) {
        navigate("/login");
        return;
      }

      try {
        const response = await fetch("http://localhost:3000/profile", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          localStorage.removeItem("token");
          navigate("/login");
          return;
        }

        const data = await response.json();
        setUser(data.user);
      } catch (err) {
        console.error(err);
        navigate("/login");
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    navigate("/login");
  };

  if (loading) {
    return <p>Loading...</p>;
  }

  return (
    <div>
      <h1>Dashboard</h1>
      {user && (
        <div>
          <p>Welcome, {user.name}</p>
          <p>Email: {user.email}</p>
        </div>
      )}
      <button onClick={handleLogout}>Log Out</button>
    </div>
  );
}

export default Dashboard;
