import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ArrowLeft } from "lucide-react";
import ModalDialog from "../components/common/ModalDialog";
import StatusBadge from "../components/common/StatusBadge";
import PatientFormModal from "../components/patients/PatientFormModal";
import { useAuth } from "../context/useAuth";
import {
  deletePatient,
  subscribeToPatient,
  updatePatient,
} from "../services/patientService";
import { subscribeToPatientScreenings } from "../services/screeningService";
import {
  calculateAge,
  formatClinicalDate,
  formatClinicalDateTime,
} from "../utils/formatters";

export default function PatientDetailsPage() {
  const { patientId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [patient, setPatient] = useState(null);
  const [screenings, setScreenings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!patientId || !user?.uid) return undefined;

    let patientLoaded = false;
    let screeningsLoaded = false;

    const finishCheck = () => {
      if (patientLoaded && screeningsLoaded) setLoading(false);
    };

    const unsubPatient = subscribeToPatient(
      patientId,
      (record) => {
        setPatient(record);
        patientLoaded = true;
        finishCheck();
      },
      (err) => {
        setError(err.message || "Unable to load patient details.");
        patientLoaded = true;
        finishCheck();
      }
    );

    const unsubScreenings = subscribeToPatientScreenings(
      patientId,
      user.uid,
      (list) => {
        setScreenings(list);
        screeningsLoaded = true;
        finishCheck();
      },
      (err) => {
        setError(err.message || "Unable to load patient screening history.");
        screeningsLoaded = true;
        finishCheck();
      }
    );

    return () => {
      unsubPatient();
      unsubScreenings();
    };
  }, [patientId, user?.uid]);

  const handleEditSubmit = async (formData) => {
    await updatePatient(patientId, formData);
  };

  const handleConfirmDelete = async () => {
    setDeleting(true);
    try {
      await deletePatient(patientId);
      navigate("/patients", { replace: true });
    } catch (err) {
      setError(err.message || "Failed to delete patient record.");
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-surface border border-border rounded-sm p-8 text-center text-sm text-secondary">
        Loading patient record...
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="bg-surface border border-border rounded-sm p-8 space-y-3">
        <h1 className="text-lg font-semibold text-foreground">
          Patient record not found
        </h1>
        <p className="text-sm text-secondary">
          The requested patient record does not exist or may have been removed.
        </p>
        <Link
          to="/patients"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-link hover:underline"
        >
          <ArrowLeft size={15} strokeWidth={1.75} aria-hidden="true" />
          Back to patient management
        </Link>
      </div>
    );
  }

  const age = calculateAge(patient.dateOfBirth);

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/patients"
          className="inline-flex items-center gap-1.5 text-sm text-secondary hover:text-foreground mb-3"
        >
          <ArrowLeft size={15} strokeWidth={1.75} aria-hidden="true" />
          Back to patients
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-4 border-b border-border">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-semibold text-foreground">
                {patient.fullName}
              </h1>
              <StatusBadge status={patient.status} />
            </div>
            <p className="text-sm text-secondary mt-1">
              MRN <span className="font-mono text-foreground">{patient.mrn}</span>{" "}
              &middot; Primary focus: {patient.affectedSide}{" "}
              {patient.primaryJoint}
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="px-3.5 py-2 text-sm font-medium text-foreground bg-surface hover:bg-surface-muted border border-border rounded-sm"
            >
              Edit record
            </button>
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              className="px-3.5 py-2 text-sm font-medium text-danger-text bg-surface hover:bg-danger-bg border border-border rounded-sm"
            >
              Delete
            </button>
            <Link
              to={`/screening?patientId=${patient.id}`}
              className="link-button px-4 py-2 text-sm font-medium bg-accent hover:bg-accent-hover text-accent-foreground rounded-sm"
            >
              New screening
            </Link>
          </div>
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

      {/* Structured Demographics & Clinical Baseline */}
      <section className="bg-surface border border-border rounded-sm">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">
            Patient profile & clinical baseline
          </h2>
        </div>

        <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 divide-y sm:divide-y-0 sm:gap-px bg-border">
          <div className="bg-surface px-4 py-3">
            <dt className="text-xs text-secondary">Date of birth / Age</dt>
            <dd className="text-sm font-medium text-foreground mt-0.5">
              {formatClinicalDate(patient.dateOfBirth)}
              {age !== null ? ` (${age} years)` : ""}
            </dd>
          </div>
          <div className="bg-surface px-4 py-3">
            <dt className="text-xs text-secondary">Sex</dt>
            <dd className="text-sm font-medium text-foreground mt-0.5">
              {patient.sex}
            </dd>
          </div>
          <div className="bg-surface px-4 py-3">
            <dt className="text-xs text-secondary">Phone</dt>
            <dd className="text-sm font-medium text-foreground mt-0.5">
              {patient.phone || "—"}
            </dd>
          </div>
          <div className="bg-surface px-4 py-3">
            <dt className="text-xs text-secondary">Email</dt>
            <dd className="text-sm font-medium text-foreground mt-0.5">
              {patient.email || "—"}
            </dd>
          </div>
          <div className="bg-surface px-4 py-3">
            <dt className="text-xs text-secondary">Last screening</dt>
            <dd className="text-sm font-medium text-foreground mt-0.5">
              {formatClinicalDate(patient.lastScreeningAt)}
            </dd>
          </div>
          <div className="bg-surface px-4 py-3">
            <dt className="text-xs text-secondary">Latest risk status</dt>
            <dd className="mt-0.5">
              <StatusBadge status={patient.lastRiskLevel} />
            </dd>
          </div>
        </dl>

        <div className="px-4 py-3.5 border-t border-border">
          <div className="text-xs text-secondary mb-1">Baseline clinical notes</div>
          <p className="text-sm text-foreground whitespace-pre-wrap">
            {patient.clinicalNotes || "No baseline clinical notes recorded."}
          </p>
        </div>
      </section>

      {/* Screening History Table */}
      <section className="bg-surface border border-border rounded-sm">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h2 id="patient-history-heading" className="text-base font-semibold text-foreground">
            Screening history ({screenings.length})
          </h2>
          <Link
            to={`/screening?patientId=${patient.id}`}
            className="text-sm font-medium text-link hover:underline"
          >
            Record new screening
          </Link>
        </div>

        <div
          tabIndex={0}
          role="region"
          aria-labelledby="patient-history-heading"
          className="clinical-table-region"
        >
          <table className="clinical-table">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Joint</th>
                <th scope="col">Active flexion</th>
                <th scope="col">Ext. deficit</th>
                <th scope="col">Pain (VAS)</th>
                <th scope="col">Flags</th>
                <th scope="col">Risk level</th>
                <th scope="col">Review status</th>
                <th scope="col" className="text-right">
                  Result
                </th>
              </tr>
            </thead>
            <tbody>
              {screenings.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center text-secondary py-8">
                    No screenings recorded for this patient yet.
                  </td>
                </tr>
              ) : (
                screenings.map((item) => (
                  <tr key={item.id}>
                    <td className="whitespace-nowrap text-secondary">
                      {formatClinicalDateTime(item.createdAt)}
                    </td>
                    <td className="whitespace-nowrap">
                      {item.side} {item.jointType}
                    </td>
                    <td>
                      {item.flexionDeg != null ? `${item.flexionDeg}°` : "—"}
                    </td>
                    <td>
                      {item.extensionDeficitDeg != null
                        ? `${item.extensionDeficitDeg}°`
                        : "—"}
                    </td>
                    <td>
                      {item.painScore != null ? `${item.painScore}/10` : "—"}
                    </td>
                    <td className="font-medium">
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

      <PatientFormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSubmit={handleEditSubmit}
        initialPatient={patient}
      />

      <ModalDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete patient record?"
      >
        <div className="space-y-4">
          <p className="text-sm text-secondary">
            Remove <strong className="text-foreground">{patient.fullName}</strong>{" "}
            (MRN {patient.mrn}) from the patient registry? Existing screening
            documents will remain archived under your clinic account, but this
            patient entry cannot be restored.
          </p>
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-border">
            <button
              type="button"
              autoFocus
              onClick={() => setDeleteOpen(false)}
              className="px-4 py-2 text-sm font-medium text-foreground bg-surface-muted hover:bg-surface-hover border border-border rounded-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={handleConfirmDelete}
              className="px-4 py-2 text-sm font-medium bg-danger-strong text-white rounded-sm"
            >
              {deleting ? "Deleting..." : "Delete patient"}
            </button>
          </div>
        </div>
      </ModalDialog>
    </div>
  );
}
