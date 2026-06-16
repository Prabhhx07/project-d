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
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-md rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="mb-4 text-2xl font-semibold text-gray-900">Dashboard</h1>
        {user && (
          <div className="mb-6 space-y-1 text-gray-700">
            <p>Welcome, {user.name}</p>
            <p className="text-sm text-gray-500">{user.email}</p>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="rounded-md bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-900"
        >
          Log Out
        </button>
      </div>
    </div>
  );
}

export default Dashboard;
