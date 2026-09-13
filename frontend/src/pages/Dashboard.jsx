import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, CartesianGrid, Legend
} from 'recharts';
import { api } from '../api.js';
import { formatDate, daysUntil } from '../utils.js';

const COLORS = ['#1d4ed8', '#7c3aed', '#16a34a', '#d97706', '#dc2626', '#0891b2', '#db2777', '#65a30d'];

const MOIS = ['jan', 'fév', 'mar', 'avr', 'mai', 'juin', 'juil', 'août', 'sep', 'oct', 'nov', 'déc'];
const fmtMois = (m) => {
  const [y, mm] = String(m).split('-');
  return `${MOIS[Number(mm) - 1]} ${String(y).slice(2)}`;
};

function PieLabel(props) {
  const { cx, cy, midAngle, innerRadius = 0, outerRadius, value, percent } = props;
  if (!value) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.42;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text
      x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central"
      fontSize={14} fontWeight={700} paintOrder="stroke" stroke="rgba(0,0,0,0.35)" strokeWidth={2}
    >
      {value}
    </text>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [expiring, setExpiring] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/dashboard').then(setData).catch((e) => setError(e.message));
    api.get('/dashboard/expiring').then(setExpiring).catch(() => {});
  }, []);

  if (error) return <div className="error-banner">{error}</div>;
  if (!data) return <div className="empty-state"><span className="spinner" /></div>;

  const soon = expiring.slice(0, 10);
  const fmtEUR = (v) => Number(v || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 });

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Dashboard</h2>
          <div className="sub">Vue d'ensemble des contrats</div>
        </div>
      </div>

      <div className="cards">
        <div className="stat-card">
          <div className="label">Contrats</div>
          <div className="value blue">{data.total}</div>
        </div>
        <div className="stat-card">
          <div className="label">Montant total</div>
          <div className="value green">{fmtEUR(data.totalAmount)} €</div>
        </div>
        <div className="stat-card">
          <div className="label">Expirations &lt; 90 jours</div>
          <div className="value orange">{data.expiring90}</div>
        </div>
        <div className="stat-card">
          <div className="label">Expirés</div>
          <div className="value red">{data.expired}</div>
        </div>
      </div>

      <div className="charts-grid">
        <div className="panel">
          <h3>Contrats par type <span className="charts-total">({data.byType.reduce((s, d) => s + d.value, 0) || 0} contrats)</span></h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={data.byType} dataKey="value" nameKey="key" cx="50%" cy="50%" outerRadius={95} label={PieLabel} labelLine={false}>
                {data.byType.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="panel">
          <h3>Montants par type de contrat (€)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={data.amountByType} dataKey="value" nameKey="key" cx="50%" cy="50%" outerRadius={95} label={PieLabel} labelLine={false}>
                {data.amountByType.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="panel">
          <h3>Expirations à venir (6 mois)</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={(data.expirations || []).map((e) => ({ ...e, label: fmtMois(e.mois) }))}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="n" name="Contrats" fill="#1d4ed8" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="panel">
        <h3>Contrats en cours et stoppés par année (année = Contract Stop Date)</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data.stopByYear || []}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="year" />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Legend />
            <Bar dataKey="enCours" name="En cours" fill="#16a34a" />
            <Bar dataKey="stoppes" name="Stoppés" fill="#dc2626" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="panel">
        <div className="page-header" style={{ marginBottom: 10 }}>
          <h3>Prochaines expirations (90 jours)</h3>
          <Link to="/contrats"><button className="btn btn-sm btn-ghost">Voir tous</button></Link>
        </div>
        {soon.length === 0 ? (
          <div className="empty-state">Aucun contrat n'expire dans les 90 prochains jours.</div>
        ) : (
          <ul className="list-expiring">
            {soon.map((c) => {
              const d = daysUntil(c.contract_end);
              return (
                <li key={c.id}>
                  <span><b>{c.customer_name}</b> — {c.sap_ewp || c.sap_eupac || c.import_id || ''}</span>
                  <span>
                    {formatDate(c.contract_end)}
                    {' '}
                    {d !== null
                      ? <span className={`badge ${d <= 30 ? 'badge-red' : 'badge-orange'}`}>J-{d}</span>
                      : null}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}