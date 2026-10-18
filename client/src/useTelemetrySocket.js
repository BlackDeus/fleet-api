import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export function useTelemetrySocket(regions, onTelemetry) {
  const socketsRef = useRef([]);
  const [status, setStatus] = useState('connecting');
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

  useEffect(() => {
    const regionList = (Array.isArray(regions) ? regions : [regions]).filter(Boolean);
    if (!regionList.length) return undefined;

    const sockets = regionList.map(region => {
      const socket = io(API_BASE, {
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: Infinity,
        randomizationFactor: 0.5
      });

      socket.on('connect', () => {
        setStatus('online');
        setReconnectAttempts(0);
        socket.emit('join-region', region);
      });
      socket.on('disconnect', () => {
        setStatus(current => current === 'online' ? 'reconnecting' : 'offline');
      });
      socket.io.on('reconnect_attempt', attempt => {
        setStatus('reconnecting');
        setReconnectAttempts(attempt);
      });
      socket.io.on('reconnect', () => {
        setStatus('online');
        setReconnectAttempts(0);
        socket.emit('join-region', region);
      });
      socket.on('telemetry:update', onTelemetry);
      return socket;
    });
    socketsRef.current = sockets;

    return () => {
      sockets.forEach(socket => {
        socket.off('telemetry:update', onTelemetry);
        socket.disconnect();
      });
      socketsRef.current = [];
    };
  }, [regions, onTelemetry]);

  return { status, reconnectAttempts };
}
