import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { MetricDataPoint, Alert } from '../types/index';

interface SocketContextType {
  isConnected: boolean;
  latestMetric: MetricDataPoint | null;
  lastMetric: MetricDataPoint | null;
  alerts: Alert[];
  lastTelemetryTimestamp: string | null;
}

const SocketContext = createContext<SocketContextType>({
  isConnected: false,
  latestMetric: null,
  lastMetric: null,
  alerts: [],
  lastTelemetryTimestamp: null
});

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [latestMetric, setLatestMetric] = useState<MetricDataPoint | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [lastTelemetryTimestamp, setLastTelemetryTimestamp] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let reconnectTimer: NodeJS.Timeout;

    const connectWebSocket = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setIsConnected(true);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'METRICS_UPDATE' && data.data) {
              setLatestMetric(data.data);
              setLastTelemetryTimestamp(data.timestamp || new Date().toISOString());
            } else if (data.type === 'ALERT_TRIGGERED' && data.data) {
              setAlerts(prev => [...prev, data.data]);
            } else if (data.type === 'ALERTS_UPDATE' && Array.isArray(data.data)) {
              setAlerts(data.data);
            }
          } catch (e) {
            // ignore
          }
        };

        ws.onclose = () => {
          setIsConnected(false);
          // auto reconnect in 5s
          reconnectTimer = setTimeout(connectWebSocket, 5000);
        };

        ws.onerror = () => {
          setIsConnected(false);
          ws.close();
        };
      } catch (err) {
        setIsConnected(false);
        reconnectTimer = setTimeout(connectWebSocket, 5000);
      }
    };

    connectWebSocket();

    return () => {
      clearTimeout(reconnectTimer);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  return (
    <SocketContext.Provider 
      value={{ 
        isConnected, 
        latestMetric, 
        lastMetric: latestMetric, 
        alerts, 
        lastTelemetryTimestamp 
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);

