import React, { useEffect, useState, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

function correctQuaternionForThreeJS(q) {
  return new THREE.Quaternion(-q.y, q.z, -q.x, q.w);
}

function RotatingCube({ euler, quaternion, rotationMode }) {
  const meshRef = useRef();

     useEffect(() => {
     if (rotationMode === 'quaternion' && quaternion && meshRef.current) {
       const corrected = correctQuaternionForThreeJS(quaternion);
       meshRef.current.quaternion.copy(corrected);
     } else if (rotationMode === 'euler' && euler && meshRef.current) {
       meshRef.current.rotation.set(
         -(euler.pitch * Math.PI) / 180, // X-axis (pitch)
         (euler.yaw * Math.PI) / 180,   // Y-axis (yaw)
         -(euler.roll * Math.PI) / 180   // Z-axis (roll)
       );
     }
   }, [quaternion, euler, rotationMode]);

  return (
    <mesh ref={meshRef}>
      <boxGeometry args={[2, 2, 2]} />
      <meshStandardMaterial 
        color="#00d4ff" 
        metalness={0.3} 
        roughness={0.1}
        emissive="#001122"
        emissiveIntensity={0.2}
      />
    </mesh>
  );
}

// 3D Scene Component
function Scene({ euler, quaternion, rotationMode }) {
  return (
    <div style={{ 
      width: '100%', 
      height: '500px', 
      borderRadius: '16px',
      overflow: 'hidden',
      boxShadow: '0 8px 32px rgba(0, 212, 255, 0.3)',
      border: '1px solid rgba(0, 212, 255, 0.2)'
    }}>
      <Canvas camera={{ position: [0, 0, 5] }}>
        <ambientLight intensity={1.2} />
        <directionalLight position={[5, 5, 5]} intensity={2} color="#ffffff" />
        <directionalLight position={[-5, -5, -5]} intensity={1} color="#ff6b6b" />
        <pointLight position={[0, 10, 0]} intensity={1.5} color="#00d4ff" />
        <pointLight position={[0, -10, 0]} intensity={0.8} color="#ffffff" />
        <RotatingCube euler={euler} quaternion={quaternion} rotationMode={rotationMode} />
        <OrbitControls enableZoom={true} enablePan={true} enableRotate={true} />
      </Canvas>
    </div>
  );
}

// Serial Port Manager Component
function SerialPortManager({ onDataReceived, isConnected, onConnectionChange }) {
  const [port, setPort] = useState(null);
  const [reader, setReader] = useState(null);
  const [availablePorts, setAvailablePorts] = useState([]);
  const [selectedPort, setSelectedPort] = useState(null);
  const [dataBuffer, setDataBuffer] = useState('');

  const connectToPort = async () => {
    try {
      if (!selectedPort) {
        alert('Please select a port first');
        return;
      }

      if (selectedPort.readable) {
        alert('Port is already in use. Please disconnect first or try a different port.');
        return;
      }

      const baudRates = [115200, 9600, 57600, 38400, 19200];
      let connected = false;

      for (const baudRate of baudRates) {
        try {
          console.log(`Trying to connect with baud rate: ${baudRate}`);
          await selectedPort.open({ baudRate });
          connected = true;
          console.log(`Successfully connected with baud rate: ${baudRate}`);
          break;
        } catch (error) {
          console.log(`Failed with baud rate ${baudRate}:`, error.message);
          if (baudRate === baudRates[baudRates.length - 1]) {
            throw error;
          }
        }
      }

      if (!connected) {
        throw new Error('Failed to connect with any baud rate');
      }

      const textDecoder = new TextDecoderStream();
      const readableStreamClosed = selectedPort.readable.pipeTo(textDecoder.writable);
      const reader = textDecoder.readable.getReader();
      
      setReader(reader);
      setPort(selectedPort);
      onConnectionChange(true);

      const readLoop = async () => {
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) {
              console.log('Serial port reader closed');
              break;
            }
            
            // Accumulate data in buffer and parse complete JSON
            setDataBuffer(prevBuffer => {
              const newBuffer = prevBuffer + value;
              
              // Prevent buffer from growing too large (safety measure)
              if (newBuffer.length > 10000) {
                console.warn('Buffer too large, truncating to last 1000 characters');
                const truncatedBuffer = newBuffer.substring(newBuffer.length - 1000);
                console.log('Truncated buffer:', truncatedBuffer);
                return truncatedBuffer;
              }
              
              // Only log buffer if it's not empty
              if (newBuffer.length > 0) {
                console.log('Current buffer:', newBuffer);
              }
              
              // Process all complete JSON objects in the buffer
              let processedIndex = 0;
              let braceCount = 0;
              let jsonStart = -1;
              let processedCount = 0;
              
              for (let i = 0; i < newBuffer.length; i++) {
                if (newBuffer[i] === '{') {
                  if (braceCount === 0) {
                    jsonStart = i;
                  }
                  braceCount++;
                } else if (newBuffer[i] === '}') {
                  braceCount--;
                  if (braceCount === 0 && jsonStart !== -1) {
                    // Extract complete JSON
                    const jsonString = newBuffer.substring(jsonStart, i + 1);
                    console.log('Complete JSON found:', jsonString);
                    
                    try {
                      const data = JSON.parse(jsonString);
                      console.log('Parsed JSON data:', data);
                      if (data.roll !== undefined && data.pitch !== undefined && data.yaw !== undefined) {
                        onDataReceived(data);
                        processedCount++;
                        console.log('Valid euler data received:', data);
                      } else if (data.w !== undefined && data.x !== undefined && data.y !== undefined && data.z !== undefined) {
                        onDataReceived(data);
                        processedCount++;
                        console.log('Valid quaternion data received:', data);
                      } else {
                        console.log('JSON received but missing euler angles or quaternion components:', data);
                      }
                    } catch (e) {
                      console.log('Failed to parse JSON:', jsonString);
                      console.log('Parse error:', e.message);
                    }
                    
                    // Update processed index to after this JSON object
                    processedIndex = i + 1;
                    jsonStart = -1;
                  }
                }
              }
              
              // Return remaining buffer (incomplete JSON)
              const remainingBuffer = newBuffer.substring(processedIndex);
              if (processedCount > 0) {
                console.log(`Processed ${processedCount} JSON objects, remaining buffer:`, remainingBuffer);
              } else {
                console.log('Remaining buffer:', remainingBuffer);
              }
              return remainingBuffer;
            });
          }
        } catch (error) {
          console.error('Error reading from serial port:', error);
          onConnectionChange(false);
        }
      };

      readLoop();
    } catch (error) {
      console.error('Error connecting to serial port:', error);
      
      let errorMessage = 'Failed to connect to serial port: ' + error.message;
      
      if (error.message.includes('Failed to open serial port')) {
        errorMessage = 'Serial port is in use by another application. Please:\n' +
                      '1. Close any other applications using this port (Arduino IDE, Serial Monitor, etc.)\n' +
                      '2. Try disconnecting and reconnecting your device\n' +
                      '3. Try a different USB port\n' +
                      '4. Check if your device drivers are properly installed';
      } else if (error.message.includes('Access denied')) {
        errorMessage = 'Access denied to serial port. Please:\n' +
                      '1. Make sure no other application is using this port\n' +
                      '2. Try running the browser with administrator privileges\n' +
                      '3. Check your device permissions';
      }
      
      alert(errorMessage);
    }
  };

  const disconnectFromPort = async () => {
    try {
      if (reader) {
        await reader.cancel();
        setReader(null);
      }
      if (port) {
        await port.close();
        setPort(null);
      }
      setDataBuffer('');
      onConnectionChange(false);
    } catch (error) {
      console.error('Error disconnecting from serial port:', error);
    }
  };

  const refreshPorts = async () => {
    try {
      const ports = await navigator.serial.getPorts();
      setAvailablePorts(ports);
    } catch (error) {
      console.error('Error getting available ports:', error);
    }
  };

  const requestPort = async () => {
    try {
      const newPort = await navigator.serial.requestPort();
      setAvailablePorts(prev => [...prev, newPort]);
      setSelectedPort(newPort);
    } catch (error) {
      console.error('Error requesting port:', error);
    }
  };

  useEffect(() => {
    refreshPorts();
  }, []);

  return (
    <div style={{ 
      background: 'linear-gradient(135deg, rgba(30, 30, 40, 0.8) 0%, rgba(20, 20, 30, 0.9) 100%)',
      border: '1px solid rgba(0, 212, 255, 0.2)',
      padding: '24px', 
      borderRadius: '16px', 
      marginBottom: '24px',
      backdropFilter: 'blur(10px)',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
    }}>
      <h3 style={{ 
        margin: '0 0 20px 0', 
        color: '#00d4ff', 
        fontSize: '20px',
        fontWeight: '600',
        textShadow: '0 0 10px rgba(0, 212, 255, 0.5)'
      }}>
        Serial Port Connection
      </h3>
      
      <div style={{ marginBottom: '16px' }}>
        <label style={{ 
          marginRight: '12px', 
          color: '#e0e0e0',
          fontWeight: '500'
        }}>Select Port:</label>
        <select 
          value={selectedPort ? availablePorts.indexOf(selectedPort) : ''} 
          onChange={(e) => setSelectedPort(availablePorts[e.target.value])}
          style={{ 
            marginRight: '12px', 
            padding: '8px 12px',
            backgroundColor: 'rgba(20, 20, 30, 0.8)',
            border: '1px solid rgba(0, 212, 255, 0.3)',
            borderRadius: '8px',
            color: '#e0e0e0',
            fontSize: '14px'
          }}
        >
          <option value="">Choose a port...</option>
          {availablePorts.map((port, index) => (
            <option key={index} value={index}>
              {port.getInfo().usbProductId ? 
                `USB Port (${port.getInfo().usbProductId})` : 
                `Port ${index + 1}`
              }
            </option>
          ))}
        </select>
        <button onClick={requestPort} style={{ 
          marginRight: '12px', 
          padding: '8px 16px',
          backgroundColor: 'rgba(0, 212, 255, 0.2)',
          border: '1px solid rgba(0, 212, 255, 0.4)',
          borderRadius: '8px',
          color: '#00d4ff',
          cursor: 'pointer',
          fontSize: '14px',
          transition: 'all 0.3s ease'
        }}>
          Request New Port
        </button>
        <button onClick={refreshPorts} style={{ 
          padding: '8px 16px',
          backgroundColor: 'rgba(255, 107, 107, 0.2)',
          border: '1px solid rgba(255, 107, 107, 0.4)',
          borderRadius: '8px',
          color: '#ff6b6b',
          cursor: 'pointer',
          fontSize: '14px',
          transition: 'all 0.3s ease'
        }}>
          Refresh
        </button>
      </div>

      <div>
        {!isConnected ? (
          <button 
            onClick={connectToPort} 
            disabled={!selectedPort}
            style={{ 
              background: selectedPort ? 'linear-gradient(135deg, #00d4ff 0%, #0099cc 100%)' : 'rgba(60, 60, 60, 0.5)',
              color: 'white', 
              padding: '12px 24px', 
              border: 'none', 
              borderRadius: '8px',
              cursor: selectedPort ? 'pointer' : 'not-allowed',
              opacity: selectedPort ? 1 : 0.6,
              fontSize: '16px',
              fontWeight: '600',
              transition: 'all 0.3s ease',
              boxShadow: selectedPort ? '0 4px 15px rgba(0, 212, 255, 0.4)' : 'none'
            }}
          >
            Connect
          </button>
        ) : (
          <button 
            onClick={disconnectFromPort}
            style={{ 
              background: 'linear-gradient(135deg, #ff6b6b 0%, #ee5a52 100%)',
              color: 'white', 
              padding: '12px 24px', 
              border: 'none', 
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '16px',
              fontWeight: '600',
              transition: 'all 0.3s ease',
              boxShadow: '0 4px 15px rgba(255, 107, 107, 0.4)'
            }}
          >
            Disconnect
          </button>
        )}
        
        <span style={{ 
          marginLeft: '16px', 
          color: isConnected ? '#00d4ff' : '#ff6b6b',
          fontSize: '16px',
          fontWeight: '500',
          textShadow: isConnected ? '0 0 10px rgba(0, 212, 255, 0.5)' : '0 0 10px rgba(255, 107, 107, 0.5)'
        }}>
          {isConnected ? '● Connected' : '○ Disconnected'}
        </span>
      </div>
    </div>
  );
}

function App() {
  const [euler, setEuler] = useState({ roll: 0, pitch: 0, yaw: 0 });
  const [quaternion, setQuaternion] = useState({ w: 1, x: 0, y: 0, z: 0 });
  const [dataSource, setDataSource] = useState('http'); // 'http' or 'serial'
  const [rotationMode, setRotationMode] = useState('euler'); // 'euler' or 'quaternion'
  const [isSerialConnected, setIsSerialConnected] = useState(false);
  const httpIntervalRef = useRef(null);

  // HTTP Data Fetching
  const startHttpFetching = () => {
    if (httpIntervalRef.current) {
      clearInterval(httpIntervalRef.current);
    }
    
    httpIntervalRef.current = setInterval(() => {
      fetch("http://192.168.2.194/euler") // Replace with ESP32 IP
        .then((res) => res.json())
        .then((data) => setEuler(data))
        .catch((err) => console.error(err));
    }, 50);
  };

  const stopHttpFetching = () => {
    if (httpIntervalRef.current) {
      clearInterval(httpIntervalRef.current);
      httpIntervalRef.current = null;
    }
  };

  // Serial Data Handling
  const handleSerialData = (data) => {
    // Check if data contains quaternion components
    if (data.w !== undefined && data.x !== undefined && data.y !== undefined && data.z !== undefined) {
      setQuaternion(data);
    } else if (data.roll !== undefined && data.pitch !== undefined && data.yaw !== undefined) {
      setEuler(data);
    }
  };

  const handleSerialConnectionChange = (connected) => {
    setIsSerialConnected(connected);
  };

  useEffect(() => {
    if (dataSource === 'http') {
      stopHttpFetching();
      startHttpFetching();
    } else {
      stopHttpFetching();
    }

    return () => {
      stopHttpFetching();
    };
  }, [dataSource]);

  return (
    <div style={{ 
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', 
      padding: '32px',
      minHeight: '100vh',
      width: '100vw',
      background: 'linear-gradient(135deg, #0a0a0f 0%, #1a1a2e 50%, #16213e 100%)',
      color: '#e0e0e0',
      boxSizing: 'border-box'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '100%'
      }}>
        <h1 style={{
          fontSize: '48px',
          fontWeight: '700',
          margin: '0 0 8px 0',
          background: 'linear-gradient(135deg, #00d4ff 0%, #ff6b6b 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          textAlign: 'center',
          textShadow: '0 0 30px rgba(0, 212, 255, 0.5)'
        }}>
          IMU Dashboard
        </h1>
        
        <p style={{
          textAlign: 'center',
          color: '#a0a0a0',
          fontSize: '18px',
          margin: '0 0 40px 0',
          fontStyle: 'italic'
        }}>
          Real-time orientation monitoring and visualization
        </p>
        
        {/* Data Source and Rotation Mode Selection */}
        <div style={{ 
          marginBottom: '32px',
          textAlign: 'center',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '24px',
          flexWrap: 'wrap'
        }}>
          <div>
            <label style={{ 
              marginRight: '16px', 
              fontWeight: '600',
              color: '#00d4ff',
              fontSize: '18px'
            }}>Data Source:</label>
            <select 
              value={dataSource} 
              onChange={(e) => setDataSource(e.target.value)}
              style={{ 
                padding: '12px 20px', 
                borderRadius: '12px', 
                border: '2px solid rgba(0, 212, 255, 0.3)',
                backgroundColor: 'rgba(20, 20, 30, 0.8)',
                color: '#e0e0e0',
                fontSize: '16px',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'all 0.3s ease'
              }}
            >
              <option value="http">HTTP (ESP32)</option>
              <option value="serial">Serial Port</option>
            </select>
          </div>

          <div>
            <label style={{ 
              marginRight: '16px', 
              fontWeight: '600',
              color: '#ff6b6b',
              fontSize: '18px'
            }}>Rotation Mode:</label>
            <select 
              value={rotationMode} 
              onChange={(e) => setRotationMode(e.target.value)}
              style={{ 
                padding: '12px 20px', 
                borderRadius: '12px', 
                border: '2px solid rgba(255, 107, 107, 0.3)',
                backgroundColor: 'rgba(20, 20, 30, 0.8)',
                color: '#e0e0e0',
                fontSize: '16px',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'all 0.3s ease'
              }}
            >
              <option value="euler">Euler Angles</option>
              <option value="quaternion">Quaternion</option>
            </select>
          </div>


          
          {dataSource === 'http' && (
            <span style={{ 
              color: '#00d4ff',
              fontSize: '16px',
              fontWeight: '500',
              textShadow: '0 0 10px rgba(0, 212, 255, 0.5)'
            }}>
              ● Fetching from HTTP endpoint
            </span>
          )}
        </div>

        {/* Serial Port Manager - only show when serial is selected */}
        {dataSource === 'serial' && (
          <SerialPortManager 
            onDataReceived={handleSerialData}
            isConnected={isSerialConnected}
            onConnectionChange={handleSerialConnectionChange}
          />
        )}
        
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))',
          gap: '40px', 
          alignItems: 'start',
          width: '100%'
        }}>
          {/* 3D Cube Visualization */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(30, 30, 40, 0.8) 0%, rgba(20, 20, 30, 0.9) 100%)',
            padding: '32px',
            borderRadius: '20px',
            border: '1px solid rgba(0, 212, 255, 0.2)',
            backdropFilter: 'blur(10px)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
          }}>
            <h3 style={{
              margin: '0 0 24px 0',
              color: '#00d4ff',
              fontSize: '24px',
              fontWeight: '600',
              textAlign: 'center',
              textShadow: '0 0 10px rgba(0, 212, 255, 0.5)'
            }}>
              3D Orientation
            </h3>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <Scene euler={euler} quaternion={quaternion} rotationMode={rotationMode} />
            </div>
          </div>
          
          {/* Numerical Values */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(30, 30, 40, 0.8) 0%, rgba(20, 20, 30, 0.9) 100%)',
            padding: '32px',
            borderRadius: '20px',
            border: '1px solid rgba(0, 212, 255, 0.2)',
            backdropFilter: 'blur(10px)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
          }}>
            <h3 style={{
              margin: '0 0 24px 0',
              color: '#00d4ff',
              fontSize: '24px',
              fontWeight: '600',
              textAlign: 'center',
              textShadow: '0 0 10px rgba(0, 212, 255, 0.5)'
            }}>
              {rotationMode === 'euler' ? 'Euler Angles' : 'Quaternion'}
            </h3>
            <div style={{ 
              fontSize: '24px', 
              lineHeight: '2',
              marginBottom: '32px'
            }}>
              {rotationMode === 'euler' ? (
                <>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '16px',
                    marginBottom: '12px',
                    background: 'rgba(0, 212, 255, 0.1)',
                    borderRadius: '12px',
                    border: '1px solid rgba(0, 212, 255, 0.2)'
                  }}>
                    <span style={{ color: '#00d4ff', fontWeight: '600' }}>Roll:</span>
                    <span style={{ color: '#e0e0e0', fontWeight: '700' }}>{euler.roll.toFixed(2)}°</span>
                  </div>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '16px',
                    marginBottom: '12px',
                    background: 'rgba(255, 107, 107, 0.1)',
                    borderRadius: '12px',
                    border: '1px solid rgba(255, 107, 107, 0.2)'
                  }}>
                    <span style={{ color: '#ff6b6b', fontWeight: '600' }}>Pitch:</span>
                    <span style={{ color: '#e0e0e0', fontWeight: '700' }}>{euler.pitch.toFixed(2)}°</span>
                  </div>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '16px',
                    marginBottom: '12px',
                    background: 'rgba(138, 43, 226, 0.1)',
                    borderRadius: '12px',
                    border: '1px solid rgba(138, 43, 226, 0.2)'
                  }}>
                    <span style={{ color: '#8a2be2', fontWeight: '600' }}>Yaw:</span>
                    <span style={{ color: '#e0e0e0', fontWeight: '700' }}>{euler.yaw.toFixed(2)}°</span>
                  </div>
                </>
              ) : (
                <>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '16px',
                    marginBottom: '12px',
                    background: 'rgba(0, 212, 255, 0.1)',
                    borderRadius: '12px',
                    border: '1px solid rgba(0, 212, 255, 0.2)'
                  }}>
                    <span style={{ color: '#00d4ff', fontWeight: '600' }}>W:</span>
                    <span style={{ color: '#e0e0e0', fontWeight: '700' }}>{quaternion.w.toFixed(4)}</span>
                  </div>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '16px',
                    marginBottom: '12px',
                    background: 'rgba(255, 107, 107, 0.1)',
                    borderRadius: '12px',
                    border: '1px solid rgba(255, 107, 107, 0.2)'
                  }}>
                    <span style={{ color: '#ff6b6b', fontWeight: '600' }}>X:</span>
                    <span style={{ color: '#e0e0e0', fontWeight: '700' }}>{quaternion.x.toFixed(4)}</span>
                  </div>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '16px',
                    marginBottom: '12px',
                    background: 'rgba(138, 43, 226, 0.1)',
                    borderRadius: '12px',
                    border: '1px solid rgba(138, 43, 226, 0.2)'
                  }}>
                    <span style={{ color: '#8a2be2', fontWeight: '600' }}>Y:</span>
                    <span style={{ color: '#e0e0e0', fontWeight: '700' }}>{quaternion.y.toFixed(4)}</span>
                  </div>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '16px',
                    marginBottom: '12px',
                    background: 'rgba(255, 193, 7, 0.1)',
                    borderRadius: '12px',
                    border: '1px solid rgba(255, 193, 7, 0.2)'
                  }}>
                    <span style={{ color: '#ffc107', fontWeight: '600' }}>Z:</span>
                    <span style={{ color: '#e0e0e0', fontWeight: '700' }}>{quaternion.z.toFixed(4)}</span>
                  </div>
                </>
              )}
            </div>
            
            {/* Connection Status */}
            <div style={{ 
              padding: '20px', 
              background: 'rgba(20, 20, 30, 0.8)', 
              borderRadius: '16px',
              border: '1px solid rgba(0, 212, 255, 0.2)'
            }}>
              <h4 style={{
                margin: '0 0 16px 0',
                color: '#00d4ff',
                fontSize: '18px',
                fontWeight: '600'
              }}>
                Connection Status
              </h4>
              <div style={{ fontSize: '16px', lineHeight: '1.6' }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: '8px'
                }}>
                  <span style={{ color: '#a0a0a0' }}>Data Source:</span>
                  <span style={{ 
                    color: dataSource === 'http' ? '#00d4ff' : '#ff6b6b',
                    fontWeight: '600'
                  }}>
                    {dataSource === 'http' ? 'HTTP' : 'Serial Port'}
                  </span>
                </div>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: '8px'
                }}>
                  <span style={{ color: '#a0a0a0' }}>Rotation Mode:</span>
                  <span style={{ 
                    color: rotationMode === 'euler' ? '#00d4ff' : '#ff6b6b',
                    fontWeight: '600'
                  }}>
                    {rotationMode === 'euler' ? 'Euler Angles' : 'Quaternion'}
                  </span>
                </div>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between'
                }}>
                  <span style={{ color: '#a0a0a0' }}>Status:</span>
                  <span style={{ 
                    color: dataSource === 'http' ? '#00d4ff' : (isSerialConnected ? '#00d4ff' : '#ff6b6b'),
                    fontWeight: '600',
                    textShadow: dataSource === 'http' ? '0 0 10px rgba(0, 212, 255, 0.5)' : 
                                  (isSerialConnected ? '0 0 10px rgba(0, 212, 255, 0.5)' : '0 0 10px rgba(255, 107, 107, 0.5)')
                  }}>
                    {dataSource === 'http' ? '● Active' : (isSerialConnected ? '● Connected' : '○ Disconnected')}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
