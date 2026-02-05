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

const STORAGE_VERSION = "v2";

export default function Home() {
  const { context, isReady } = useMiniApp();
  const [authData, setAuthData] = useState<AuthResponse | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string>("");
  const [checkIns, setCheckIns] = useState<string[]>([]);
  const [status, setStatus] = useState<string>("");
  const lastSavedHashRef = useRef<`0x${string}` | null>(null);
  const lastActionRef = useRef<"checkin" | "bonus" | null>(null);
  const [bonusCountsByDay, setBonusCountsByDay] = useState<
    Record<string, number>
  >({});

  const userId = authData?.user?.fid ?? context?.user?.fid;
  const todayKey = useMemo(() => getTodayKey(), []);
  const displayDate = useMemo(() => formatDisplayDate(new Date()), []);
  const timeZone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    []
  );
  const { address, isConnected } = useAccount();
  const shortAddress = useMemo(() => {
    if (!address) {
      return null;
    }
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }, [address]);
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
    const storageKey = `daily-check-in:${STORAGE_VERSION}:${userId}`;
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? (JSON.parse(raw) as string[]) : [];
    const sorted = Array.from(new Set(parsed)).sort();
    setCheckIns(sorted);
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      return;
    }
    const storageKey = `daily-check-in:bonus:${STORAGE_VERSION}:${userId}`;
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    setBonusCountsByDay(parsed);
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
      if (lastActionRef.current === "checkin") {
        setCheckIns((prev) => {
          if (prev.includes(todayKey)) {
            return prev;
          }
          const updated = [...prev, todayKey].sort();
          if (userId) {
          const storageKey = `daily-check-in:${STORAGE_VERSION}:${userId}`;
            localStorage.setItem(storageKey, JSON.stringify(updated));
          }
          return updated;
        });
        setStatus("Check-in confirmed on Base.");
      }
      if (lastActionRef.current === "bonus") {
        setBonusCountsByDay((prev) => {
          const current = prev[todayKey] ?? 0;
          const next = Math.min(current + 1, 10);
          const updated = { ...prev, [todayKey]: next };
          if (userId) {
            const storageKey = `daily-check-in:bonus:${STORAGE_VERSION}:${userId}`;
            localStorage.setItem(storageKey, JSON.stringify(updated));
          }
          return updated;
        });
        setStatus("Bonus transaction confirmed.");
      }
    }
  }, [txHash, isConfirming, isConfirmed, todayKey, userId]);

  const hasCheckedInToday = checkIns.includes(todayKey);
  const bonusCountToday = bonusCountsByDay[todayKey] ?? 0;
  const canSendBonus = bonusCountToday < 10;
  const bonusRemaining = Math.max(0, 10 - bonusCountToday);
  const lastCheckIn = checkIns.length ? checkIns[checkIns.length - 1] : null;
  const checkInDisabledReason = useMemo(() => {
    if (!userId) return "Waiting for identity";
    if (hasCheckedInToday) return "Already checked in today";
    if (isTxPending || isConfirming) return "Transaction in progress";
    if (isConnecting) return "Connecting wallet";
    return "";
  }, [userId, hasCheckedInToday, isTxPending, isConfirming, isConnecting]);
  const bonusDisabledReason = useMemo(() => {
    if (!userId) return "Waiting for identity";
    if (!canSendBonus) return "Daily bonus limit reached";
    if (isTxPending || isConfirming) return "Transaction in progress";
    if (isConnecting) return "Connecting wallet";
    return "";
  }, [userId, canSendBonus, isTxPending, isConfirming, isConnecting]);

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
      lastActionRef.current = "checkin";
      await sendTransactionAsync({
        to: toAddress,
        value: BigInt(0),
      });
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Transaction cancelled."
      );
    }
  };

  const handleBonusTx = async () => {
    setStatus("");
    if (!userId) {
      setStatus("Waiting for user identity...");
      return;
    }
    if (!canSendBonus) {
      setStatus("Daily bonus limit reached.");
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
      setStatus("Confirm the bonus 0 ETH transaction...");
      lastActionRef.current = "bonus";
      await sendTransactionAsync({
        to: toAddress,
        value: BigInt(0),
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
          <span className={styles.headerIcon} aria-hidden="true" />
          <p className={styles.eyebrow}>Daily Check-In</p>
          <h1 className={styles.title}>Daily consistency</h1>
          <p className={styles.date}>
            {displayDate} · {timeZone}
          </p>
          {hasCheckedInToday && (
            <span className={styles.badge}>Checked in today</span>
          )}
        </header>

        <div
          className={`${styles.status} ${txError ? styles.statusError : ""}`}
        >
          {isAuthLoading && <span>Connecting to Base...</span>}
          {!isAuthLoading && authError && <span>{authError}</span>}
          {!isAuthLoading && !authError && !isConnected && (
            <span>Connect your wallet to send transactions.</span>
          )}
          {!isAuthLoading && !authError && !isConnected && (
            <span className={styles.walletHint}>Use your Base wallet.</span>
          )}
          {!isAuthLoading && !authError && (isTxPending || isConfirming) && (
            <span>Transaction in progress...</span>
          )}
          {!isAuthLoading && !authError && isConnected && hasCheckedInToday && (
            <span>You already checked in today</span>
          )}
          {!isAuthLoading && !authError && isConnected && !hasCheckedInToday && (
            <span>Tap to send a 0 ETH check-in transaction.</span>
          )}
          {!isAuthLoading && !authError && isConnected && shortAddress && (
            <span className={styles.wallet}>Wallet: {shortAddress}</span>
          )}
        </div>

        <button
          className={styles.checkInButton}
          type="button"
          onClick={handleCheckIn}
          aria-label="Send daily check-in transaction"
          data-track="check-in"
          title={checkInDisabledReason}
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
        <p className={styles.helper}>
          Each check-in sends a 0 ETH transaction and still needs gas.
        </p>
        <p className={styles.note}>Limit: one check-in per day.</p>

        {status && <p className={styles.feedback}>{status}</p>}

        <div className={styles.divider} />

        <section className={styles.summary}>
          <div className={styles.count}>
            <span className={styles.countNumber}>{checkIns.length}</span>
            <span className={styles.countLabel}>days checked in</span>
          </div>
          <div className={styles.countSeparator} />
          <p className={styles.lastCheckIn}>
            Last check-in: {lastCheckIn ?? "—"}
          </p>
          <div className={styles.history}>
            <p className={styles.historyTitle}>Last 7 days</p>
            <p className={styles.historyHint}>Format: YYYY-MM-DD</p>
            {checkIns.length === 0 && (
              <p className={styles.historyEmpty}>No check-ins yet :)</p>
            )}
            {checkIns.length > 0 && (
              <ul className={styles.historyList}>
                {checkIns
                  .slice()
                  .reverse()
                  .slice(0, 7)
                  .map((day) => (
                    <li key={day} className={styles.historyItem}>
                      • {day}
                    </li>
                  ))}
              </ul>
            )}
          </div>
          <div className={styles.bonusPanel}>
            <div className={styles.bonusText}>
              Bonus tx today: {bonusCountToday}/10
            </div>
            {bonusCountToday === 0 && (
              <p className={styles.bonusHint}>
                Tip: you can send up to 10 bonus tx per day.
              </p>
            )}
            <p className={styles.bonusGas}>
              Bonus transactions also require gas.
            </p>
            {bonusRemaining > 0 && bonusRemaining <= 2 && (
              <p className={styles.bonusLow}>
                Only {bonusRemaining} bonus tx left today.
              </p>
            )}
            {!canSendBonus && (
              <p className={styles.bonusLimit}>Daily bonus limit reached.</p>
            )}
            <div className={styles.bonusDivider} />
            <button
              className={styles.bonusButton}
              type="button"
              onClick={handleBonusTx}
              aria-label="Send bonus transaction"
              data-track="bonus-tx"
              title={bonusDisabledReason}
              disabled={
                !userId ||
                !canSendBonus ||
                isTxPending ||
                isConfirming ||
                isConnecting
              }
            >
              {isTxPending || isConfirming ? "Sending bonus..." : "Send Bonus"}
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
