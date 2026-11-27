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
    const unsubscribe = subscribeToAuthState(async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          const docProfile = await getClinicianProfile(firebaseUser.uid);
          setProfile(docProfile);
        } catch {
          setProfile(null);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
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
