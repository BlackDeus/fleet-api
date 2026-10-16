import {
  useCallback,
  useEffect,
  useRef,
  useState
} from 'react';

import {
  useTelemetrySocket
} from './useTelemetrySocket';

import './style.css';


const REGIONS = [
  'kyiv',
  'lviv',
  'odesa'
];


function App() {

  const [region, setRegion] =
    useState('kyiv');

  const [lastPoint, setLastPoint] =
    useState(null);

  const [receivedCount, setReceivedCount] =
    useState(0);

  /*
   * -------------------------------------------------------
   * ДЕДУПЛІКАЦІЯ
   *
   * Ключ:
   * device_id + ts
   *
   * НЕ використовуємо координати.
   * -------------------------------------------------------
   */

  const receivedMessages =
    useRef(new Set());


  /*
   * -------------------------------------------------------
   * THROTTLING
   *
   * Не більше одного оновлення карти
   * на секунду.
   * -------------------------------------------------------
   */

  const pendingPoint =
    useRef(null);

  const throttleTimer =
    useRef(null);


  /*
   * -------------------------------------------------------
   * ФУНКЦІЯ ОТРИМАННЯ TELEMETRY
   * -------------------------------------------------------
   */

  const handleTelemetry =
    useCallback(payload => {

      /*
       * Нас цікавлять GPS-повідомлення.
       */

      if (
        payload.metric !== 'gps'
      ) {
        return;
      }


      /*
       * Формуємо унікальний ключ.
       */

      const messageKey =
        `${payload.device_id}:${payload.ts}`;


      /*
       * Якщо таке повідомлення
       * вже обробляли — пропускаємо.
       */

      if (
        receivedMessages.current.has(
          messageKey
        )
      ) {
        console.log(
          '[DEDUP] duplicate:',
          messageKey
        );

        return;
      }


      /*
       * Запам'ятовуємо повідомлення.
       */

      receivedMessages.current.add(
        messageKey
      );


      setReceivedCount(
        count => count + 1
      );


      /*
       * Додаємо останню точку
       * у pending.
       *
       * Це і є throttling.
       */

      pendingPoint.current =
        payload;


      /*
       * Якщо timer вже існує —
       * новий не створюємо.
       */

      if (
        throttleTimer.current
      ) {
        return;
      }


      throttleTimer.current =
        setTimeout(() => {

          if (
            pendingPoint.current
          ) {
            setLastPoint(
              pendingPoint.current
            );

            console.log(
              '[THROTTLE] map update:',
              pendingPoint.current
            );

            pendingPoint.current =
              null;
          }

          throttleTimer.current =
            null;

        }, 1000);

    }, []);


  /*
   * -------------------------------------------------------
   * SOCKET.IO
   * -------------------------------------------------------
   */

  const {
    status,
    reconnectAttempts
  } =
    useTelemetrySocket(
      region,
      handleTelemetry
    );


  /*
   * -------------------------------------------------------
   * CLEANUP THROTTLE
   * -------------------------------------------------------
   */

  useEffect(() => {
    return () => {

      if (
        throttleTimer.current
      ) {
        clearTimeout(
          throttleTimer.current
        );
      }

    };
  }, []);


  /*
   * -------------------------------------------------------
   * ЗМІНА РЕГІОНУ
   * -------------------------------------------------------
   */

  useEffect(() => {

    setLastPoint(null);

    receivedMessages.current.clear();

    setReceivedCount(0);

  }, [region]);


  /*
   * -------------------------------------------------------
   * CATCH-UP ПІСЛЯ ПЕРЕПІДКЛЮЧЕННЯ
   *
   * Для демонстрації беремо останні GPS
   * точки конкретного регіону.
   * -------------------------------------------------------
   */

  useEffect(() => {

    if (
      status !== 'online'
    ) {
      return;
    }

    /*
     * При стабільному підключенні
     * потік уже йде через Socket.IO.
     *
     * REST тут використовується як
     * механізм відновлення пропущених
     * повідомлень.
     */

  }, [status, region]);


  return (
    <div className="app">

      <header className="header">

        <div>
          <h1>
            Моніторинг транспортного парку
          </h1>

          <p>
            Практична робота №3 —
            канал даних реального часу
          </p>
        </div>

      </header>


      <main className="content">

        <section className="panel">

          <h2>
            Диспетчерська панель
          </h2>


          <div className="control">

            <label>
              Регіон:
            </label>

            <select
              value={region}
              onChange={event =>
                setRegion(
                  event.target.value
                )
              }
            >

              {REGIONS.map(item => (
                <option
                  key={item}
                  value={item}
                >
                  {item.toUpperCase()}
                </option>
              ))}

            </select>

          </div>


          <div className="status-row">

            <span>
              Стан Socket.IO:
            </span>

            <span
              className={`status ${status}`}
            >
              {status}
            </span>

          </div>


          <div className="status-row">

            <span>
              Спроби перепідключення:
            </span>

            <strong>
              {reconnectAttempts}
            </strong>

          </div>


          <div className="status-row">

            <span>
              Отримано унікальних GPS:
            </span>

            <strong>
              {receivedCount}
            </strong>

          </div>

        </section>


        <section className="panel map-panel">

          <h2>
            GPS-карта
          </h2>


          <div className="map">

            <div className="road road-1" />
            <div className="road road-2" />


            {lastPoint && (

              <div
                className="vehicle"
                style={{
                  left: `${mapX(
                    lastPoint.value
                  )}%`,
                  top: `${mapY(
                    lastPoint.value
                  )}%`
                }}
              >
                🚚
              </div>

            )}


            {!lastPoint && (
              <div className="empty-map">
                Очікування GPS...
              </div>
            )}

          </div>

        </section>


        <section className="panel">

          <h2>
            Останнє GPS-оновлення
          </h2>


          {lastPoint ? (

            <div className="telemetry">

              <p>
                <strong>
                  Транспорт:
                </strong>{' '}
                {lastPoint.device_id}
              </p>

              <p>
                <strong>
                  Регіон:
                </strong>{' '}
                {lastPoint.region}
              </p>

              <p>
                <strong>
                  Координати:
                </strong>{' '}
                {formatGps(lastPoint.value)}
              </p>

              <p>
                <strong>
                  Timestamp:
                </strong>{' '}
                {lastPoint.ts}
              </p>

            </div>

          ) : (

            <p>
              Даних поки немає.
            </p>

          )}

        </section>

      </main>

    </div>
  );
}


/*
 * ---------------------------------------------------------
 * GPS
 * ---------------------------------------------------------
 *
 * value може бути:
 *
 * {
 *   lat: 50.4501,
 *   lon: 30.5234
 * }
 *
 * або JSON-рядком.
 *
 */

function parseGps(value) {

  if (
    typeof value === 'object'
  ) {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return {
      lat: 0,
      lon: 0
    };
  }
}


function formatGps(value) {

  const gps =
    parseGps(value);

  return (
    `${Number(gps.lat).toFixed(6)}, ` +
    `${Number(gps.lon).toFixed(6)}`
  );
}


/*
 * ---------------------------------------------------------
 * Умовне відображення GPS на навчальній карті.
 *
 * Це не змінює самі GPS-дані.
 * ---------------------------------------------------------
 */

function mapX(value) {

  const gps =
    parseGps(value);

  const lon =
    Number(gps.lon);

  return Math.max(
    5,
    Math.min(
      95,
      ((lon - 29) / 11) * 100
    )
  );
}


function mapY(value) {

  const gps =
    parseGps(value);

  const lat =
    Number(gps.lat);

  return Math.max(
    5,
    Math.min(
      95,
      100 - ((lat - 45) / 9) * 100
    )
  );
}


export default App;