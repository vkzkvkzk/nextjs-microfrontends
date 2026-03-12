'use client';

import { useState } from 'react';

export default function CounterPage() {
  const [count, setCount] = useState(0);

  return (
    <div style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
      <div
        style={{
          display: 'inline-block',
          padding: '0.25rem 0.75rem',
          background: '#533483',
          color: '#fff',
          borderRadius: '4px',
          fontSize: '0.8rem',
          marginBottom: '1rem'
        }}
      >
        counter 앱 (port 3002)
      </div>

      <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Counter</h1>
      <p style={{ color: '#666', marginBottom: '2rem' }}>
        이 페이지는 <strong>counter</strong> 앱에서 렌더링됩니다.
        <br />
        클라이언트 컴포넌트로 상태 관리가 독립적으로 동작합니다.
      </p>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1.5rem',
          marginBottom: '2rem'
        }}
      >
        <button
          onClick={() => setCount((prev) => prev - 1)}
          aria-label="카운트 1 감소"
          style={{
            width: '48px',
            height: '48px',
            fontSize: '1.5rem',
            border: '1px solid #ddd',
            borderRadius: '8px',
            background: '#fff',
            cursor: 'pointer'
          }}
        >
          &minus;
        </button>

        <span
          aria-live="polite"
          style={{
            fontSize: '4rem',
            fontWeight: 'bold',
            minWidth: '120px',
            fontVariantNumeric: 'tabular-nums'
          }}
        >
          {count}
        </span>

        <button
          onClick={() => setCount((prev) => prev + 1)}
          aria-label="카운트 1 증가"
          style={{
            width: '48px',
            height: '48px',
            fontSize: '1.5rem',
            border: '1px solid #ddd',
            borderRadius: '8px',
            background: '#fff',
            cursor: 'pointer'
          }}
        >
          +
        </button>
      </div>

      <button
        onClick={() => setCount(0)}
        style={{
          padding: '0.5rem 1.5rem',
          border: '1px solid #ddd',
          borderRadius: '6px',
          background: '#f5f5f5',
          cursor: 'pointer',
          fontSize: '0.9rem'
        }}
      >
        초기화
      </button>

      <section
        style={{
          marginTop: '3rem',
          padding: '1.5rem',
          background: '#f5f5f5',
          borderRadius: '8px',
          textAlign: 'left'
        }}
      >
        <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>독립 앱 특성</h2>
        <ul style={{ lineHeight: 1.8, color: '#555', paddingLeft: '1.2rem' }}>
          <li>이 Counter는 <code>counter</code> 앱 내부에서 독립적으로 상태를 관리</li>
          <li>다른 앱(home, blog)으로 이동하면 full-page navigation 발생</li>
          <li>돌아오면 상태가 초기화됨 (각 앱은 독립 SPA)</li>
          <li>빌드/배포를 독립적으로 수행 가능</li>
        </ul>
      </section>
    </div>
  );
}
