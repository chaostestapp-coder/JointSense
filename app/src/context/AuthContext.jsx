import { useEffect, useState } from "react";
import { isFirebaseConfigured } from "../config/firebase";
import {
  getClinicianProfile,
  registerClinician,
  sendClinicianPasswordReset,
  signInClinician,
  signOutClinician,
  subscribeToAuthState,
} from "../services/authService";
import { AuthContext } from "./useAuth";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const unsubscribe = subscribeToAuthState((firebaseUser) => {
      if (!active) return;

      setUser(firebaseUser);
      setLoading(false);

      if (!firebaseUser) {
        setProfile(null);
        return;
      }

      getClinicianProfile(firebaseUser.uid)
        .then((docProfile) => {
          if (active) {
            setProfile(docProfile);
          }
        })
        .catch(() => {
          if (active) {
            setProfile(null);
          }
        });
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const value = {
    user,
    profile,
    loading,
    isFirebaseConfigured,
    signIn: signInClinician,
    register: registerClinician,
    resetPassword: sendClinicianPasswordReset,
    signOut: signOutClinician,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
