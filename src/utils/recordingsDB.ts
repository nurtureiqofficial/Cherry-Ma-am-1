// Client-Side IndexedDB Storage for durable student classroom video recordings
// This avoids clunky cloud storage charges and ensures 100% privacy and lightning-fast local downloads.

const DB_NAME = "CherryMaamRecordingsDB_v3";
const STORE_NAME = "recordings";
const DB_VERSION = 1;

export interface SavedRecording {
  id: string;         // sessionId
  topicTitle: string;
  subject: string;
  date: string;
  duration: string;
  blob?: Blob;        // Optional for compatibility
  arrayBuffer?: ArrayBuffer; // Direct arrayBuffer for 100% sandboxed iframe compatibility
  theme: string;
}

export function initRecordingsDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error("IndexedDB open failed");
      reject(request.error);
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event: any) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
  });
}

export async function saveRecording(recording: SavedRecording): Promise<void> {
  const db = await initRecordingsDB();
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);

      // Exclude raw blob from stored object to guarantee no DataCloneError in iframe sandbox.
      // We will reconstruct it from arrayBuffer on read.
      const { blob, ...serializable } = recording;

      const request = store.put(serializable);

      request.onerror = () => {
        reject(request.error || new Error("Save request failed"));
      };

      transaction.oncomplete = () => {
        resolve();
      };

      transaction.onerror = () => {
        reject(transaction.error || new Error("Save transaction failed"));
      };

      transaction.onabort = () => {
        reject(new Error("Save transaction aborted"));
      };
    } catch (err) {
      reject(err);
    }
  });
}

export async function getAllRecordings(): Promise<SavedRecording[]> {
  const db = await initRecordingsDB();
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const results = request.result || [];
        const mapped = results.map((rec: any) => {
          // Reconstruct Blob from ArrayBuffer if missing, or if it is a broken empty object
          if (!(rec.blob instanceof Blob) && rec.arrayBuffer) {
            try {
              rec.blob = new Blob([rec.arrayBuffer], { type: "video/webm" });
            } catch (e) {
              console.error("Failed reconstructing video blob from array buffer:", e);
            }
          }
          return rec;
        });
        resolve(mapped);
      };

      request.onerror = () => {
        reject(request.error || new Error("Get recordings request failed"));
      };

      transaction.onerror = () => {
        reject(transaction.error || new Error("Get recordings transaction failed"));
      };
    } catch (err) {
      reject(err);
    }
  });
}

export async function deleteRecording(id: string): Promise<void> {
  const db = await initRecordingsDB();
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onerror = () => {
        reject(request.error || new Error("Delete request failed"));
      };

      transaction.oncomplete = () => {
        resolve();
      };

      transaction.onerror = () => {
        reject(transaction.error || new Error("Delete transaction failed"));
      };

      transaction.onabort = () => {
        reject(new Error("Delete transaction aborted"));
      };
    } catch (err) {
      reject(err);
    }
  });
}
