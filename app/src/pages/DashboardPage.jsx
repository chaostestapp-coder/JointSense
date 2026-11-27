import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import StatusBadge from "../components/common/StatusBadge";
import { useAuth } from "../context/useAuth";
import { subscribeToPatients } from "../services/patientService";
import { subscribeToScreenings } from "../services/screeningService";
import { formatClinicalDate, formatClinicalDateTime } from "../utils/formatters";

const WORKLIST_FILTERS = ["All", "Pending Review", "Elevated Risk", "Monitor"];

export default function DashboardPage() {
  const { user, profile } = useAuth();
  const [patients, setPatients] = useState([]);
  const [screenings, setScreenings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeFilter, setActiveFilter] = useState("All");

  useEffect(() => {
    if (!user?.uid) return undefined;

    let patientsLoaded = false;
    let screeningsLoaded = false;

    const markLoaded = () => {
      if (patientsLoaded && screeningsLoaded) {
        setLoading(false);
      }
    };

    const unsubPatients = subscribeToPatients(
      user.uid,
      (list) => {
        setPatients(list);
        patientsLoaded = true;
        markLoaded();
      },
      (err) => {
        setError(err.message || "Unable to load patient records.");
        patientsLoaded = true;
        markLoaded();
      }
    );

    const unsubScreenings = subscribeToScreenings(
      user.uid,
      (list) => {
        setScreenings(list);
        screeningsLoaded = true;
        markLoaded();
      },
      (err) => {
        setError(err.message || "Unable to load screening worklist.");
        screeningsLoaded = true;
        markLoaded();
      }
    );

    return () => {
      unsubPatients();
      unsubScreenings();
    };
  }, [user?.uid]);

  const counts = useMemo(() => {
    const pendingReview = screenings.filter(
      (s) => s.reviewStatus === "Pending Review"
    ).length;
    const elevatedRisk = screenings.filter(
      (s) => s.riskLevel === "Elevated Risk"
    ).length;

    return {
      patients: patients.length,
      screenings: screenings.length,
      pendingReview,
      elevatedRisk,
    };
  }, [patients, screenings]);

  const filteredScreenings = useMemo(() => {
    if (activeFilter === "All") return screenings.slice(0, 12);
    if (activeFilter === "Pending Review") {
      return screenings.filter((s) => s.reviewStatus === "Pending Review");
    }
    return screenings.filter((s) => s.riskLevel === activeFilter);
  }, [screenings, activeFilter]);

  const recentPatients = useMemo(() => patients.slice(0, 6), [patients]);
  const clinicianName =
    profile?.fullName || user?.displayName || user?.email || "Clinician";

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-4 border-b border-border">
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            Clinical worklist
          </h1>
          <p className="text-sm text-secondary mt-1">
            Signed in as {clinicianName}. Real-time overview of joint screenings
            and patient follow-ups.
          </p>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <Link
            to="/patients"
            className="link-button px-3.5 py-2 text-sm font-medium text-foreground bg-surface hover:bg-surface-muted border border-border rounded-sm"
          >
            Manage patients
          </Link>
          <Link
            to="/screening"
            className="link-button px-3.5 py-2 text-sm font-medium bg-accent hover:bg-accent-hover text-accent-foreground rounded-sm"
          >
            New screening
          </Link>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="px-4 py-2.5 text-sm bg-danger-bg text-danger-text border border-danger-border rounded-sm"
        >
          {error}
        </div>
      )}

      {/* Single unified summary bar instead of separate statistic tiles */}
      <div className="bg-surface border border-border rounded-sm grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-border">
        <div className="px-4 py-3">
          <div className="text-xs text-secondary">Registered patients</div>
          <div className="text-xl font-semibold text-foreground mt-0.5">
            {counts.patients}
          </div>
        </div>
        <div className="px-4 py-3">
          <div className="text-xs text-secondary">Total screenings</div>
          <div className="text-xl font-semibold text-foreground mt-0.5">
            {counts.screenings}
          </div>
        </div>
        <div className="px-4 py-3">
          <div className="text-xs text-secondary">Pending review</div>
          <div className="text-xl font-semibold text-foreground mt-0.5">
            {counts.pendingReview}
          </div>
        </div>
        <div className="px-4 py-3">
          <div className="text-xs text-secondary">Elevated risk findings</div>
          <div className="text-xl font-semibold text-danger-text mt-0.5">
            {counts.elevatedRisk}
          </div>
        </div>
      </div>

      {/* Primary Worklist Table */}
      <section className="bg-surface border border-border rounded-sm">
        <div className="px-4 py-3 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 id="worklist-heading" className="text-base font-semibold text-foreground">
            Screening queue
          </h2>
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Filter screening queue">
            {WORKLIST_FILTERS.map((filter) => {
              const isSelected = activeFilter === filter;
              return (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setActiveFilter(filter)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-[3px] border ${
                    isSelected
                      ? "bg-surface-muted text-foreground border-border font-semibold"
                      : "bg-transparent text-secondary hover:text-foreground border-transparent"
                  }`}
                >
                  {filter}
                </button>
              );
            })}
          </div>
        </div>

        <div
          tabIndex={0}
          role="region"
          aria-labelledby="worklist-heading"
          className="clinical-table-region"
        >
          <table className="clinical-table">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Patient</th>
                <th scope="col">MRN</th>
                <th scope="col">Joint</th>
                <th scope="col">Flexion</th>
                <th scope="col">Pain</th>
                <th scope="col">Flags</th>
                <th scope="col">Risk level</th>
                <th scope="col">Review status</th>
                <th scope="col" className="text-right">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="text-center text-secondary py-8">
                    Loading screening worklist...
                  </td>
                </tr>
              ) : filteredScreenings.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center text-secondary py-8">
                    No screenings match this view.{" "}
                    <Link to="/screening" className="text-link hover:underline font-medium">
                      Record a joint screening
                    </Link>
                    .
                  </td>
                </tr>
              ) : (
                filteredScreenings.map((item) => (
                  <tr key={item.id}>
                    <td className="whitespace-nowrap text-secondary">
                      {formatClinicalDateTime(item.createdAt)}
                    </td>
                    <td className="font-medium text-foreground">
                      <Link
                        to={`/patients/${item.patientId}`}
                        className="hover:underline text-foreground"
                      >
                        {item.patientName}
                      </Link>
                    </td>
                    <td className="text-secondary font-mono text-xs">
                      {item.patientMrn}
                    </td>
                    <td className="whitespace-nowrap">
                      {item.side} {item.jointType}
                    </td>
                    <td className="whitespace-nowrap">
                      {item.flexionDeg != null ? `${item.flexionDeg}°` : "—"}
                    </td>
                    <td className="whitespace-nowrap">
                      {item.painScore != null ? `${item.painScore}/10` : "—"}
                    </td>
                    <td className="whitespace-nowrap font-medium">
                      {item.evaluatedCount != null
                        ? `${item.flaggedCount ?? 0}/${item.evaluatedCount}`
                        : item.compositeIndex != null
                          ? `${item.compositeIndex}/100`
                          : "—"}
                    </td>
                    <td>
                      <StatusBadge status={item.riskLevel} />
                    </td>
                    <td>
                      <StatusBadge status={item.reviewStatus} />
                    </td>
                    <td className="text-right whitespace-nowrap">
                      <Link
                        to={`/screenings/${item.id}`}
                        className="text-sm font-medium text-link hover:underline"
                      >
                        Open result
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Recent Patients Table */}
      <section className="bg-surface border border-border rounded-sm">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h2 id="recent-patients-heading" className="text-base font-semibold text-foreground">
            Recent patient records
          </h2>
          <Link to="/patients" className="text-sm font-medium text-link hover:underline">
            View all patients
          </Link>
        </div>

        <div
          tabIndex={0}
          role="region"
          aria-labelledby="recent-patients-heading"
          className="clinical-table-region"
        >
          <table className="clinical-table">
            <thead>
              <tr>
                <th scope="col">MRN</th>
                <th scope="col">Name</th>
                <th scope="col">Primary joint</th>
                <th scope="col">Last screening</th>
                <th scope="col">Last risk</th>
                <th scope="col">Status</th>
                <th scope="col" className="text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center text-secondary py-6">
                    Loading patient directory...
                  </td>
                </tr>
              ) : recentPatients.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center text-secondary py-6">
                    No patients registered yet.{" "}
                    <Link to="/patients" className="text-link hover:underline font-medium">
                      Add your first patient
                    </Link>
                    .
                  </td>
                </tr>
              ) : (
                recentPatients.map((patient) => (
                  <tr key={patient.id}>
                    <td className="font-mono text-xs text-secondary">{patient.mrn}</td>
                    <td className="font-medium text-foreground">
                      <Link to={`/patients/${patient.id}`} className="hover:underline">
                        {patient.fullName}
                      </Link>
                    </td>
                    <td>
                      {patient.affectedSide} {patient.primaryJoint}
                    </td>
                    <td className="text-secondary">
                      {formatClinicalDate(patient.lastScreeningAt)}
                    </td>
                    <td>
                      <StatusBadge status={patient.lastRiskLevel} />
                    </td>
                    <td>
                      <StatusBadge status={patient.status} />
                    </td>
                    <td className="text-right whitespace-nowrap space-x-3">
                      <Link
                        to={`/patients/${patient.id}`}
                        className="text-sm text-secondary hover:text-foreground hover:underline"
                      >
                        Details
                      </Link>
                      <Link
                        to={`/screening?patientId=${patient.id}`}
                        className="text-sm font-medium text-link hover:underline"
                      >
                        Screen
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
