"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import sdk from "@farcaster/miniapp-sdk";
import {
  useAccount,
  useConnect,
  useSendTransaction,
  useWaitForTransactionReceipt,
} from "wagmi";
import { useMiniApp } from "./providers/MiniAppProvider";
import styles from "./page.module.css";

interface AuthResponse {
  success: boolean;
  user?: {
    fid: number;
    issuedAt?: number;
    expiresAt?: number;
  };
  message?: string;
}

const getTodayKey = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatDisplayDate = (date: Date) =>
  date.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

export default function Home() {
  const { context, isReady } = useMiniApp();
  const [authData, setAuthData] = useState<AuthResponse | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string>("");
  const [checkIns, setCheckIns] = useState<string[]>([]);
  const [status, setStatus] = useState<string>("");
  const lastSavedHashRef = useRef<`0x${string}` | null>(null);

  const userId = authData?.user?.fid ?? context?.user?.fid;
  const todayKey = useMemo(() => getTodayKey(), []);
  const displayDate = useMemo(() => formatDisplayDate(new Date()), []);
  const { address, isConnected } = useAccount();
  const { connectAsync, connectors, isPending: isConnecting } = useConnect();
  const {
    data: txHash,
    sendTransactionAsync,
    isPending: isTxPending,
    error: txError,
  } = useSendTransaction();
  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({
      hash: txHash,
    });

  useEffect(() => {
    const authenticate = async () => {
      try {
        const response = await sdk.quickAuth.fetch("/api/auth");
        const data = (await response.json()) as AuthResponse;
        setAuthData(data);
        if (!data.success) {
          setAuthError(data.message || "Unable to verify identity.");
        }
      } catch (err) {
        setAuthError(err instanceof Error ? err.message : "Auth error.");
      } finally {
        setIsAuthLoading(false);
      }
    };

    if (isReady) {
      authenticate();
    }
  }, [isReady]);

  useEffect(() => {
    if (!userId) {
      return;
    }
    const storageKey = `daily-check-in:${userId}`;
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? (JSON.parse(raw) as string[]) : [];
    const sorted = Array.from(new Set(parsed)).sort();
    setCheckIns(sorted);
  }, [userId]);

  useEffect(() => {
    if (txError) {
      setStatus(txError.message || "Transaction failed.");
    }
  }, [txError]);

  useEffect(() => {
    if (!txHash) {
      return;
    }
    if (isConfirming) {
      setStatus("Waiting for transaction confirmation...");
    }
    if (isConfirmed && lastSavedHashRef.current !== txHash) {
      lastSavedHashRef.current = txHash;
      setCheckIns((prev) => {
        if (prev.includes(todayKey)) {
          return prev;
        }
        const updated = [...prev, todayKey].sort();
        if (userId) {
          const storageKey = `daily-check-in:${userId}`;
          localStorage.setItem(storageKey, JSON.stringify(updated));
        }
        return updated;
      });
      setStatus("Check-in confirmed on Base.");
    }
  }, [txHash, isConfirming, isConfirmed, todayKey, userId]);

  const hasCheckedInToday = checkIns.includes(todayKey);

  const handleCheckIn = async () => {
    setStatus("");
    if (!userId) {
      setStatus("Waiting for user identity...");
      return;
    }
    if (hasCheckedInToday) {
      setStatus("You already checked in today");
      return;
    }
    if (isTxPending || isConfirming) {
      setStatus("Transaction already in progress...");
      return;
    }
    try {
      let toAddress = address;
      if (!isConnected) {
        setStatus("Connecting wallet...");
        const connector = connectors[0];
        if (!connector) {
          setStatus("No wallet connector available.");
          return;
        }
        const connection = await connectAsync({ connector });
        toAddress = connection.accounts?.[0] ?? toAddress;
      }
      if (!toAddress) {
        setStatus("Wallet not available.");
        return;
      }
      setStatus("Confirm the 0 ETH transaction...");
      await sendTransactionAsync({
        to: toAddress,
        value: 0n,
      });
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Transaction cancelled."
      );
    }
  };

  return (
    <div className={styles.container}>
      <main className={styles.card}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>Daily Check-In</p>
          <h1 className={styles.title}>Consistency wins</h1>
          <p className={styles.date}>{displayDate}</p>
        </header>

        <div className={styles.status}>
          {isAuthLoading && <span>Connecting to Base...</span>}
          {!isAuthLoading && authError && <span>{authError}</span>}
          {!isAuthLoading && !authError && hasCheckedInToday && (
            <span>You already checked in today</span>
          )}
          {!isAuthLoading && !authError && !hasCheckedInToday && (
            <span>Tap to send a 0 ETH check-in transaction.</span>
          )}
        </div>

        <button
          className={styles.checkInButton}
          type="button"
          onClick={handleCheckIn}
          disabled={
            !userId ||
            hasCheckedInToday ||
            isTxPending ||
            isConfirming ||
            isConnecting
          }
        >
          {isTxPending || isConfirming
            ? "Checking..."
            : hasCheckedInToday
              ? "Checked In"
              : "Check-In"}
        </button>

        {status && <p className={styles.feedback}>{status}</p>}

        <section className={styles.summary}>
          <div className={styles.count}>
            <span className={styles.countNumber}>{checkIns.length}</span>
            <span className={styles.countLabel}>days checked in</span>
          </div>
          <div className={styles.history}>
            <p className={styles.historyTitle}>Last 7 days</p>
            {checkIns.length === 0 && (
              <p className={styles.historyEmpty}>No check-ins yet.</p>
            )}
            {checkIns.length > 0 && (
              <ul className={styles.historyList}>
                {checkIns
                  .slice()
                  .reverse()
                  .slice(0, 7)
                  .map((day) => (
                    <li key={day} className={styles.historyItem}>
                      {day}
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
