import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { initializeFirestore, doc, getDoc, getDocFromServer, disableNetwork } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true
}, firebaseConfig.firestoreDatabaseId); /* CRITICAL: The app will break without this line */
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid || null,
      email: auth.currentUser?.email || null,
      emailVerified: auth.currentUser?.emailVerified || null,
      isAnonymous: auth.currentUser?.isAnonymous || null,
      tenantId: auth.currentUser?.tenantId || null,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('[Firestore Security Error]: ', JSON.stringify(errInfo, null, 2));
  throw new Error(JSON.stringify(errInfo));
}

// Connection Validation
async function testConnection() {
  // If using mock/placeholder credentials, cleanly disable network immediately
  if (
    firebaseConfig.projectId === "remixed-project-id" || 
    firebaseConfig.apiKey === "remixed-api-key" ||
    !firebaseConfig.projectId ||
    firebaseConfig.projectId.startsWith("remixed-")
  ) {
    console.warn("Firestore running in offline mock/placeholder mode.");
    try {
      await disableNetwork(db);
    } catch (e) {
      console.warn("Failed to disable Firestore network in placeholder mode:", e);
    }
    return;
  }

  try {
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Timeout checking connection")), 3000)
    );
    await Promise.race([
      getDoc(doc(db, 'test', 'connection')),
      timeoutPromise
    ]);
    console.log("Firestore backend connected.");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('client is offline') || msg.includes('unavailable') || msg.includes('Could not reach')) {
      console.warn("Firestore client operating in offline mode or waiting for backend connection.");
    } else {
      console.warn("Firestore backend connection check completed.");
    }
  }
}
testConnection();
