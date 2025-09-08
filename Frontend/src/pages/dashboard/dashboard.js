import React from "react";
import CustomDataTable from "../../components/CustomDataTable";
function Dashboard() {
  const data = Array.from({ length: 200 }, (_, i) => ({
    id: i + 1,
    name: `User ${i + 1}`,
    email: `user${i + 1}@example.com`,
    class: `calss ${i + 1}`,
    role: `role ${i + 1}`,
  }));

  return (
    <div className="dashboard-container height-full-occupied">
      dashboard
      {/*  <CustomDataTable>
        {{
          buttons: (
            <div className="add-action-buttons">
              <button className="btn" onClick={() => console.log("add user")}>
                + Add User
              </button>
            </div>
          ),
          header: (
            <tr>
              <th style={{ width: "20px" }}>
                <div>id</div>
              </th>
              <th style={{ width: "150px" }}>
                <div style={{ width: "150px" }}>name</div>
              </th>
              <th style={{ width: "150px" }}>
                <div style={{ width: "150px" }}>Email</div>
              </th>
              <th>
                <div style={{ minWidth: "150px" }}>Class</div>
              </th>
              <th style={{ width: "50px" }}>
                <div style={{ width: "50px" }}>Role</div>
              </th>
            </tr>
          ),
          rows: data.map((item) => (
            <tr key={item.id}>
              <td>{item.id}</td>
              <td style={{ width: "50px" }}>{item.name}</td>
              <td>{item.email}</td>
              <td>{item.class}</td>
              <td>{item.role}</td>
            </tr>
          )),
          footer: (
            <tr>
              <td colSpan="5">Total Users: {data.length}</td>
            </tr>
          ),
        }}
      </CustomDataTable> */}
    </div>
  );
}

export default Dashboard;
