import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import TaskwallDashboard from './TaskwallDashboard.jsx';
import './index.css';

const isTaskwallRoute = window.location.pathname.replace(/\/+$/, '') === '/taskwall';
const RootPage = isTaskwallRoute ? TaskwallDashboard : App;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RootPage />
  </React.StrictMode>,
);
