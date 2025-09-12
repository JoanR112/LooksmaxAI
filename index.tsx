import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleGenAI, Type, Modality } from "@google/genai";
import jsPDF from 'jspdf';

const App = () => {
    type AppState = 'INITIAL' | 'CAPTURING' | 'ANALYZING' | 'RESULTS' | 'IMPROVING' | 'IMPROVED';
    type Analysis = {
        ratings: {
            overall: number;
            potential: number;
            masculinity: number;
            skin_quality: number;
            jawline: number;
            cheekbones: number;
        };
        roast: string;
        improvements: string[];
    };

    // This check is crucial for deployment on external platforms.
    if (!process.env.API_KEY) {
        return (
            <main className="container">
                <div style={{
                    backgroundColor: 'rgba(255, 77, 77, 0.1)',
                    color: '#ff4d4d',
                    padding: '1.5rem',
                    borderRadius: '1rem',
                    textAlign: 'left',
                    border: '1px solid rgba(255, 77, 77, 0.2)',
                    width: '100%',
                }}>
                    <h1 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: '#ff6b6b' }}>Configuration Error</h1>
                    <p style={{ margin: 0, lineHeight: 1.6, color: 'var(--text-color)' }}>
                        The AI features are disabled because the Gemini API key is missing.
                        <br /><br />
                        To fix this, please configure the <code>API_KEY</code> environment variable in your deployment platform's settings (e.g., Vercel, Netlify, or GitHub Pages).
                    </p>
                </div>
            </main>
        );
    }

    const [appState, setAppState] = useState<AppState>('INITIAL');
    const [userImage, setUserImage] = useState<string | null>(null);
    const [analysis, setAnalysis] = useState<Analysis | null>(null);
    const [improvedImage, setImprovedImage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [isSharing, setIsSharing] = useState<boolean>(false);

    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const cleanupCamera = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
    };
    
    useEffect(() => {
        return () => cleanupCamera();
    }, []);


    const handleStart = async () => {
        setError(null);
        setAppState('CAPTURING');
        try {
            streamRef.current = await navigator.mediaDevices.getUserMedia({ video: true });
            if (videoRef.current) {
                videoRef.current.srcObject = streamRef.current;
            }
        } catch (err) {
            console.error("Camera access denied:", err);
            setError("Camera access is required. Please enable it in your browser settings.");
            setAppState('INITIAL');
        }
    };

    const handleCapture = () => {
        if (!videoRef.current) return;
        const canvas = document.createElement('canvas');
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.scale(-1, 1);
        ctx.drawImage(videoRef.current, -canvas.width, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg');
        setUserImage(dataUrl);
        cleanupCamera();
        setAppState('ANALYZING');
        analyzeImage(dataUrl);
    };
    
    const analyzeImage = async (imageDataUrl: string) => {
        setIsLoading(true);
        setError(null);
        try {
            const base64Data = imageDataUrl.split(',')[1];
            const imagePart = { inlineData: { mimeType: 'image/jpeg', data: base64Data } };
            const prompt = `You are a brutally honest looksmaxing coach. Analyze this person's face. Be harsh, critical, and direct. Do not use any positive or encouraging language. Provide a detailed roast of their facial features.
            
            Then, provide a score out of 100 for each of the following attributes: Overall, Potential, Masculinity, Skin Quality, Jawline, and Cheekbones.
            
            Finally, list specific, actionable improvements they can make to maximize their looks.
            
            Return the result in a JSON object.`;

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: { parts: [imagePart, { text: prompt }] },
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            ratings: {
                                type: Type.OBJECT,
                                properties: {
                                    overall: { type: Type.NUMBER },
                                    potential: { type: Type.NUMBER },
                                    masculinity: { type: Type.NUMBER },
                                    skin_quality: { type: Type.NUMBER },
                                    jawline: { type: Type.NUMBER },
                                    cheekbones: { type: Type.NUMBER },
                                },
                            },
                            roast: { type: Type.STRING },
                            improvements: {
                                type: Type.ARRAY,
                                items: { type: Type.STRING },
                            },
                        },
                    },
                },
            });

            const resultText = response.text.trim();
            const resultJson = JSON.parse(resultText) as Analysis;
            setAnalysis(resultJson);
            setAppState('RESULTS');
        } catch (err) {
            console.error(err);
            setError("Failed to analyze the image. Please try again.");
            setAppState('INITIAL');
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleImprove = async () => {
        if (!userImage || !analysis) return;
        setIsLoading(true);
        setError(null);
        setAppState('IMPROVING');
        try {
            const base64Data = userImage.split(',')[1];
            const imagePart = { inlineData: { mimeType: 'image/jpeg', data: base64Data } };
            const prompt = `Based on the following recommendations, edit this person's photo to show their potential after making these improvements. Make subtle, realistic changes reflecting the advice. Recommendations: ${analysis.improvements.join(', ')}`;

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash-image-preview',
                contents: { parts: [imagePart, { text: prompt }] },
                 config: {
                    responseModalities: [Modality.IMAGE, Modality.TEXT],
                 },
            });

            for (const part of response.candidates[0].content.parts) {
                if (part.inlineData) {
                    const improvedBase64 = part.inlineData.data;
                    setImprovedImage(`data:${part.inlineData.mimeType};base64,${improvedBase64}`);
                    break;
                }
            }
            setAppState('IMPROVED');

        } catch (err) {
            console.error(err);
            setError("Failed to generate the improved image. Please try again.");
            setAppState('RESULTS');
        } finally {
            setIsLoading(false);
        }
    };

    const handleShareAsPDF = async () => {
        if (!analysis || !userImage || !improvedImage) return;

        setIsSharing(true);
        try {
            const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });

            // --- Page 1 ---
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(22);
            doc.setTextColor('#1a1a1a');
            doc.text('Looksmax AI Analysis', 105, 25, { align: 'center' });

            doc.setFontSize(14);
            doc.text('Before', 60, 40, { align: 'center' });
            doc.addImage(userImage, 'JPEG', 25, 45, 70, 70);
            doc.text('After', 150, 40, { align: 'center' });
            doc.addImage(improvedImage, 'JPEG', 115, 45, 70, 70);
            
            let y = 130;

            doc.setFontSize(18);
            doc.text('Ratings', 15, y);
            doc.setLineWidth(0.5);
            doc.line(15, y + 2, 195, y + 2);
            y += 12;

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(12);
            doc.setTextColor('#333333');
            
            const ratings = Object.entries(analysis.ratings);
            const midPoint = Math.ceil(ratings.length / 2);
            let initialY = y;
            ratings.slice(0, midPoint).forEach(([key, value]) => {
                const label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                doc.text(`${label}:`, 20, y);
                doc.text(`${value} / 100`, 80, y, {align: 'right'});
                y += 9;
            });
            y = initialY;
            ratings.slice(midPoint).forEach(([key, value]) => {
                const label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                doc.text(`${label}:`, 115, y);
                doc.text(`${value} / 100`, 175, y, {align: 'right'});
                y += 9;
            });

            y = Math.max(y, initialY + midPoint * 9) + 10;

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(18);
            doc.setTextColor('#1a1a1a');
            doc.text('Brutal Roast', 15, y);
            doc.line(15, y + 2, 195, y + 2);
            y += 10;
            
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(11);
            doc.setTextColor('#333333');
            const roastLines = doc.splitTextToSize(analysis.roast, 180);
            doc.text(roastLines, 15, y);
            
            // --- Page 2 ---
            doc.addPage();
            y = 25;

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(18);
            doc.setTextColor('#1a1a1a');
            doc.text('How to Improve', 15, y);
            doc.line(15, y + 2, 195, y + 2);
            y += 12;
            
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(11);
            doc.setTextColor('#333333');

            analysis.improvements.forEach(item => {
                if (y > 270) { 
                    doc.addPage();
                    y = 25;
                }
                const improvementLines = doc.splitTextToSize(item, 175);
                doc.text('•', 20, y);
                doc.text(improvementLines, 25, y);
                y += (improvementLines.length * 4.5) + 4;
            });

            doc.save('looksmax-analysis.pdf');
        } catch (e) {
            console.error("Failed to generate PDF", e);
            setError("Sorry, we couldn't create the PDF report.");
        } finally {
            setIsSharing(false);
        }
    };


    const handleReset = () => {
        setAppState('INITIAL');
        setUserImage(null);
        setAnalysis(null);
        setImprovedImage(null);
        setError(null);
        setIsLoading(false);
        setIsSharing(false);
    };

    const renderContent = () => {
        switch (appState) {
            case 'INITIAL':
                return (
                    <>
                        <h1 className="title">Looksmax AI</h1>
                        <p className="subtitle">Get a brutally honest rating of your face and see your potential.</p>
                        <button className="button" onClick={handleStart}>Analyze My Face</button>
                    </>
                );
            case 'CAPTURING':
                return (
                    <>
                        <h1 className="title">Position Your Face</h1>
                        <div className="camera-container">
                            <video id="camera-feed" ref={videoRef} autoPlay playsInline muted></video>
                        </div>
                        <button className="button" onClick={handleCapture}>Capture</button>
                    </>
                );
            case 'ANALYZING':
            case 'IMPROVING':
                 return (
                    <>
                        <div className="loader"></div>
                        <h1 className="title">{appState === 'ANALYZING' ? 'Analyzing...' : 'Revealing Potential...'}</h1>
                        <p className="subtitle">{appState === 'ANALYZING' ? 'Our AI is roasting your features...' : 'Get ready for the glow-up...'}</p>
                    </>
                );
            case 'RESULTS':
                if (!analysis || !userImage) return null;
                return (
                    <div className="results-container">
                        <h1 className="title">Ratings</h1>
                        <img src={userImage} alt="Your selfie" className="profile-image" />
                         <div className="ratings-grid">
                            {Object.entries(analysis.ratings).map(([key, value]) => (
                                <div key={key} className="rating-item">
                                    <p className="rating-label">{key.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</p>
                                    <p className="rating-value">{value}</p>
                                    <div className="progress-bar">
                                        <div className="progress-bar-inner" style={{ width: `${value}%` }}></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="improvements-section">
                            <h2 className="section-title">Brutal Roast</h2>
                            <p className="subtitle">{analysis.roast}</p>
                        </div>
                        <div className="improvements-section">
                            <h2 className="section-title">How to Improve</h2>
                            <ul className="improvements-list">
                                {analysis.improvements.map((item, index) => <li key={index}>{item}</li>)}
                            </ul>
                        </div>
                        <button className="button" onClick={handleImprove}>Show Me My Potential</button>
                        <button className="button" style={{background: 'none', color: 'var(--text-secondary-color)', marginTop: '1rem'}} onClick={handleReset}>Start Over</button>
                    </div>
                );
            case 'IMPROVED':
                if (!userImage || !improvedImage) return null;
                return (
                    <div className="image-comparison">
                        <h1 className="title">Your Potential</h1>
                        <div className="comparison-grid">
                            <div className="comparison-item">
                                <img src={userImage} alt="Before" className="comparison-image" />
                                <p className="comparison-label">Before</p>
                            </div>
                            <div className="comparison-item">
                                <img src={improvedImage} alt="After" className="comparison-image" />
                                <p className="comparison-label">After</p>
                            </div>
                        </div>
                        <div className="button-group">
                            <button className="button" onClick={handleShareAsPDF} disabled={isSharing}>
                                {isSharing ? 'Generating PDF...' : 'Download PDF Report'}
                            </button>
                            <button className="button secondary" onClick={handleReset}>Analyze Again</button>
                        </div>
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <main className="container">
            {renderContent()}
            {error && <p className="error-message">{error}</p>}
        </main>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<App />);