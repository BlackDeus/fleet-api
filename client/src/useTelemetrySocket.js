import {
  useEffect,
  useRef,
  useState
} from 'react';

import { io } from 'socket.io-client';


export function useTelemetrySocket(
  region,
  onTelemetry
) {
  const socketRef = useRef(null);

  const [status, setStatus] =
    useState('connecting');

  const [reconnectAttempts, setReconnectAttempts] =
    useState(0);


  useEffect(() => {
    if (!region) {
      return;
    }

    const socket = io(
      'http://localhost:3000',
      {
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: Infinity,
        randomizationFactor: 0.5
      }
    );

    socketRef.current = socket;


    /*
     * -----------------------------------------------------
     * CONNECT
     * -----------------------------------------------------
     */

    socket.on('connect', () => {
      console.log(
        '[Socket.IO] connected:',
        socket.id
      );

      setStatus('online');
      setReconnectAttempts(0);

      socket.emit(
        'join-region',
        region
      );
    });


    /*
     * -----------------------------------------------------
     * DISCONNECT
     * -----------------------------------------------------
     */

    socket.on('disconnect', reason => {
      console.log(
        '[Socket.IO] disconnected:',
        reason
      );

      setStatus('offline');
    });


    /*
     * -----------------------------------------------------
     * RECONNECT ATTEMPT
     * -----------------------------------------------------
     */

    socket.io.on(
      'reconnect_attempt',
      attempt => {
        console.log(
          `[Socket.IO] reconnect attempt ${attempt}`
        );

        setStatus(
          `reconnecting (${attempt})`
        );

        setReconnectAttempts(attempt);
      }
    );


    /*
     * -----------------------------------------------------
     * RECONNECT
     * -----------------------------------------------------
     */

    socket.io.on(
      'reconnect',
      attempt => {
        console.log(
          `[Socket.IO] reconnected after ${attempt} attempts`
        );

        setStatus('online');

        setReconnectAttempts(0);

        socket.emit(
          'join-region',
          region
        );
      }
    );


    /*
     * -----------------------------------------------------
     * REALTIME TELEMETRY
     * -----------------------------------------------------
     */

    socket.on(
      'telemetry:update',
      payload => {
        console.log(
          '[telemetry:update]',
          payload
        );

        onTelemetry(payload);
      }
    );


    /*
     * -----------------------------------------------------
     * CLEANUP
     * -----------------------------------------------------
     */

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };

  }, [region, onTelemetry]);


  return {
    status,
    reconnectAttempts
  };
}