import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { User, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { auth, provider } from './firebase';
import jsPDF from 'jspdf';

const App = () => {
    type AppState = 'INITIAL' | 'CAPTURING' | 'ANALYZING' | 'RESULTS' | 'IMPROVING' | 'IMPROVED' | 'PAYWALL';
    type ResultsTab = 'RATINGS' | 'ROAST' | 'IMPROVEMENTS';
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
    
    const missingEnvVars = [
        !process.env.API_KEY && 'API_KEY'
    ].filter(Boolean);


    if (missingEnvVars.length > 0) {
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
                        The following environment variables are missing: <strong>{missingEnvVars.join(', ')}</strong>.
                        <br /><br />
                        Please configure them in your deployment platform's settings.
                    </p>
                </div>
            </main>
        );
    }
    
    const [user, setUser] = useState<User | null>(null);
    const [authLoading, setAuthLoading] = useState<boolean>(true);
    const [appState, setAppState] = useState<AppState>('INITIAL');
    const [resultsTab, setResultsTab] = useState<ResultsTab>('RATINGS');
    const [userImage, setUserImage] = useState<string | null>(null);
    const [analysis, setAnalysis] = useState<Analysis | null>(null);
    const [improvedImage, setImprovedImage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [isSharing, setIsSharing] = useState<boolean>(false);
    const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
    const [speakingText, setSpeakingText] = useState<string | null>(null);
    const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
    const [credits, setCredits] = useState<number>(0);


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
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
            if (currentUser) {
                // Give one free credit on login for this demo
                setCredits(1);
            } else {
                // Reset on logout
                setCredits(0);
                handleReset();
            }
            setAuthLoading(false);
        });
        
        const loadVoices = () => {
            setVoices(window.speechSynthesis.getVoices());
        };

        window.speechSynthesis.onvoiceschanged = loadVoices;
        loadVoices();
        
        return () => {
            unsubscribe();
            cleanupCamera();
            window.speechSynthesis.cancel();
            window.speechSynthesis.onvoiceschanged = null;
        };
    }, []);

    const handleToggleSpeech = (text: string) => {
        if (isSpeaking && speakingText === text) {
            window.speechSynthesis.cancel();
            setIsSpeaking(false);
            setSpeakingText(null);
        } else {
            window.speechSynthesis.cancel();
            
            if (voices.length === 0) {
                setError("Sorry, text-to-speech voices are not available on your device.");
                return;
            }
            
            const utterance = new SpeechSynthesisUtterance(text);
            
            let selectedVoice = voices.find(v => v.name === 'Google US English' && v.lang.startsWith('en'));
            if (!selectedVoice) {
                 selectedVoice = voices.find(v => v.lang.startsWith('en-US') && v.name.toLowerCase().includes('female'));
            }
            if (!selectedVoice) {
                selectedVoice = voices.find(v => v.lang.startsWith('en') && v.name.toLowerCase().includes('female'));
            }
            if (!selectedVoice) {
                selectedVoice = voices.find(v => v.lang.startsWith('en-US'));
            }
            if (!selectedVoice) {
                selectedVoice = voices.find(v => v.lang.startsWith('en'));
            }

            if(selectedVoice) {
                utterance.voice = selectedVoice;
            }
            
            utterance.onstart = () => {
                setIsSpeaking(true);
                setSpeakingText(text);
            };
            
            utterance.onend = () => {
                setIsSpeaking(false);
                setSpeakingText(null);
            };
            
            utterance.onerror = (event) => {
                console.error("SpeechSynthesis error:", event);
                setIsSpeaking(false);
                setSpeakingText(null);
                setError("Sorry, an error occurred with the text-to-speech feature.");
            };
            
            window.speechSynthesis.speak(utterance);
        }
    };
    
    const handleSignIn = async () => {
        try {
            await signInWithPopup(auth, provider);
        } catch (error) {
            console.error("Authentication error:", error);
            setError("Failed to sign in. Please try again.");
        }
    };

    const handleSignOut = async () => {
        try {
            await signOut(auth);
            handleReset();
        } catch (error) {
            console.error("Error signing out:", error);
            setError("Failed to sign out. Please try again.");
        }
    };

    const startCamera = async () => {
        try {
            streamRef.current = await navigator.mediaDevices.getUserMedia({ video: true });
            if (videoRef.current) {
                videoRef.current.srcObject = streamRef.current;
            }
            setAppState('CAPTURING');
        } catch (err) {
            console.error("Camera access denied:", err);
            setError("Camera access is required. Please enable it in your browser settings.");
            setAppState('INITIAL');
        }
    };

    const handleStart = async () => {
        setError(null);
        if (credits === 0 && user) {
            setAppState('PAYWALL');
            return;
        }
        await startCamera();
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
        if (credits > 0) {
            setCredits(prev => Math.max(0, prev - 1));
        }
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

            const candidate = response?.candidates?.[0];
            const imagePartFromResponse = candidate?.content?.parts?.find(part => part.inlineData);

            if (imagePartFromResponse && imagePartFromResponse.inlineData) {
                const improvedBase64 = imagePartFromResponse.inlineData.data;
                setImprovedImage(`data:${imagePartFromResponse.inlineData.mimeType};base64,${improvedBase64}`);
                setAppState('IMPROVED');
            } else {
                console.error("Image generation failed or response was blocked:", response);
                setError("Failed to generate the improved image. The request may have been blocked due to safety policies. Please try again.");
                setAppState('RESULTS');
            }
        } catch (err) {
            console.error(err);
            setError("Failed to generate the improved image. Please try again.");
            setAppState('RESULTS');
        } finally {
            setIsLoading(false);
        }
    };
    
    const handlePurchase = (scans: number | 'unlimited') => {
        if (scans === 'unlimited') {
            setCredits(-1);
        } else {
            setCredits(prev => prev + scans);
        }
        startCamera();
    };

    const handleShareAsPDF = async () => {
        if (!analysis || !userImage || !improvedImage) return;

        setIsSharing(true);
        try {
            const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
            
            const colors = {
                primary: '#00ff6a',
                background: '#1c1c1e',
                text: '#ffffff',
                textSecondary: '#8d8d92',
                ratingGreen: '#34c759',
                ratingYellow: '#ffcc00',
                ratingOrange: '#ff9500',
                ratingRed: '#ff3b30',
            };

            const getColorForRatingPDF = (rating: number) => {
                if (rating >= 80) return colors.ratingGreen;
                if (rating >= 60) return colors.ratingYellow;
                if (rating >= 40) return colors.ratingOrange;
                return colors.ratingRed;
            };

            const emojiMap: { [key: string]: string } = {
                overall: '🌟',
                potential: '🚀',
                masculinity: '💪',
                skin_quality: '✨',
                jawline: '🗿',
                cheekbones: '💎',
            };

            const improvementEmojis = ['🎯', '💡', '🚀', '✨', '💪'];
            
            const addPageHeaderAndFooter = (pageNumber: number) => {
                doc.setFillColor(colors.background);
                doc.rect(0, 0, 210, 20, 'F');
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(22);
                doc.setTextColor(colors.text);
                doc.text('Looksmax AI Analysis', 105, 14, { align: 'center' });

                doc.setDrawColor(colors.primary);
                doc.setLineWidth(1);
                doc.line(0, 20, 210, 20);

                doc.setFontSize(8);
                doc.setTextColor(colors.textSecondary);
                doc.text(`Page ${pageNumber} | Generated by Looksmax AI`, 105, 290, { align: 'center' });
            };
            
            addPageHeaderAndFooter(1);

            doc.setFontSize(16);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor('#1a1a1a');
            doc.text('😞 Before', 60, 35, { align: 'center' });
            doc.addImage(userImage, 'JPEG', 25, 40, 70, 70);
            doc.text('😎 After (Potential)', 150, 35, { align: 'center' });
            doc.addImage(improvedImage, 'JPEG', 115, 40, 70, 70);
            
            let y = 125;

            doc.setFontSize(18);
            doc.text('📊 Your Ratings', 15, y);
            y += 10;

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(12);
            
            Object.entries(analysis.ratings).forEach(([key, value]) => {
                const label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                const emoji = emojiMap[key] || '';
                
                doc.setFillColor('#f9f9f9');
                doc.setDrawColor('#eeeeee');
                doc.setLineWidth(0.5);
                doc.roundedRect(15, y - 8, 180, 16, 4, 4, 'FD');

                doc.setTextColor('#333333');
                doc.setFont('helvetica', 'bold');
                doc.text(`${emoji} ${label}`, 20, y);
                
                const barX = 90;
                const barWidth = 80;
                const barHeight = 8;
                doc.setFillColor('#e0e0e0');
                doc.roundedRect(barX, y - 5, barWidth, barHeight, 4, 4, 'F');
                // FIX: Cast `value` to number as it's inferred as unknown.
                doc.setFillColor(getColorForRatingPDF(value as number));
                // FIX: Cast `value` to number for arithmetic operation.
                doc.roundedRect(barX, y - 5, barWidth * ((value as number) / 100), barHeight, 4, 4, 'F');

                doc.setFont('helvetica', 'bold');
                doc.setFontSize(14);
                // FIX: Cast `value` to number as it's inferred as unknown.
                doc.setTextColor(getColorForRatingPDF(value as number));
                doc.text(`${value}`, barX + barWidth + 6, y + 1);
                doc.setFontSize(12);

                y += 20;
            });

            y += 5;

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(18);
            doc.setTextColor('#1a1a1a');
            doc.text('🔥 Brutal Roast', 15, y);
            y += 8;

            const roastLines = doc.splitTextToSize(analysis.roast, 170);
            const roastBoxHeight = roastLines.length * 5 + 10;
            doc.setFillColor(colors.background);
            doc.roundedRect(15, y, 180, roastBoxHeight, 5, 5, 'F');
            
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(11);
            doc.setTextColor(colors.text);
            doc.text(roastLines, 20, y + 8);
            
            doc.addPage();
            addPageHeaderAndFooter(2);
            y = 30;

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(18);
            doc.setTextColor('#1a1a1a');
            doc.text('💡 Your Glow-Up Plan', 15, y);
            y += 12;
            
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(11);

            analysis.improvements.forEach((item, index) => {
                const PADDING = 5;
                const BORDER_RADIUS = 3;
                const textX = 25;
                const textY = y + PADDING + 4;
                
                const currentEmoji = improvementEmojis[index % improvementEmojis.length];
                const improvementLines = doc.splitTextToSize(item, 165);
                const boxHeight = (improvementLines.length * 4.5) + (PADDING * 2);

                if ((y + boxHeight) > 280) {
                    doc.addPage();
                    addPageHeaderAndFooter(doc.internal.pages.length);
                    y = 30;
                }

                doc.setFillColor('#f0f0f0');
                doc.roundedRect(15, y, 180, boxHeight, BORDER_RADIUS, BORDER_RADIUS, 'F');

                doc.setFillColor(colors.primary);
                doc.rect(15, y, 2, boxHeight, 'F');

                doc.setTextColor('#333333');
                doc.setFontSize(14);
                doc.text(currentEmoji, textX - 7, textY);
                doc.setFontSize(11);
                doc.text(improvementLines, textX, textY);
                y += boxHeight + 5;
            });

            doc.save('looksmax-ai-report.pdf');
        } catch (e) {
            console.error("Failed to generate PDF", e);
            setError("Sorry, we couldn't create the PDF report.");
        } finally {
            setIsSharing(false);
        }
    };


    const handleReset = () => {
        window.speechSynthesis.cancel();
        setAppState('INITIAL');
        setUserImage(null);
        setAnalysis(null);
        setImprovedImage(null);
        setError(null);
        setIsLoading(false);
        setIsSharing(false);
        setResultsTab('RATINGS');
        setIsSpeaking(false);
        setSpeakingText(null);
    };

    const getColorForRating = (rating: number): string => {
        if (rating >= 80) return 'var(--rating-green)';
        if (rating >= 60) return 'var(--rating-yellow)';
        if (rating >= 40) return 'var(--rating-orange)';
        return 'var(--rating-red)';
    };

    const SpeakIcon = () => (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"></path>
      </svg>
    );

    const StopIcon = () => (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
        <path d="M6 6h12v12H6z"></path>
      </svg>
    );
    
    const LogoutIcon = () => (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
        <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5-5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"></path>
      </svg>
    );
    
    const renderPaywall = () => (
        <div className="content-wrapper paywall-container">
            <h1 className="title">Get More Scans</h1>
            <p className="subtitle">You've used your free scan. Choose a plan to continue improving.</p>
            <div className="plans-wrapper">
                <div className="plan-card">
                    <h2 className="plan-title">Single Scan</h2>
                    <p className="plan-price">€2<span className="plan-price-period">/scan</span></p>
                    <ul className="plan-features">
                        <li>1 Face Scan</li>
                        <li>Full Analysis</li>
                    </ul>
                    <button className="button secondary" onClick={() => handlePurchase(1)}>Purchase</button>
                </div>
                 <div className="plan-card best-value">
                    <div className="best-value-badge">Best Value</div>
                    <h2 className="plan-title">10 Scans</h2>
                    <p className="plan-price">€12.99<span className="plan-price-period">/~€1.30 per</span></p>
                    <ul className="plan-features">
                        <li>10 Face Scans</li>
                        <li>Full Analysis</li>
                        <li>Save & Compare</li>
                    </ul>
                    <button className="button" onClick={() => handlePurchase(10)}>Purchase</button>
                </div>
                 <div className="plan-card">
                    <h2 className="plan-title">Unlimited</h2>
                    <p className="plan-price">€19.99<span className="plan-price-period">/month</span></p>
                     <ul className="plan-features">
                        <li>Unlimited Scans</li>
                        <li>Full Analysis</li>
                        <li>Priority Support</li>
                    </ul>
                    <button className="button secondary" onClick={() => handlePurchase('unlimited')}>Subscribe</button>
                </div>
            </div>
            <button className="button text" onClick={handleReset} style={{marginTop: '1rem'}}>Not now</button>
        </div>
    );

    const renderAppContent = () => {
        switch (appState) {
            case 'INITIAL':
                return (
                    <>
                        <div className="content-wrapper initial-view-animation">
                            <h1 className="title">Looksmax AI</h1>
                            <p className="subtitle">Get a brutally honest rating of your face and see your potential.</p>
                        </div>
                        <div className="footer-actions initial-view-animation">
                            <button className="button" onClick={handleStart}>Analyze My Face</button>
                        </div>
                    </>
                );
            case 'CAPTURING':
                return (
                    <>
                        <div className="content-wrapper">
                            <h1 className="title">Position Your Face</h1>
                            <div className="camera-container">
                                <video id="camera-feed" ref={videoRef} autoPlay playsInline muted></video>
                            </div>
                        </div>
                        <div className="footer-actions">
                            <button className="button" onClick={handleCapture}>Capture</button>
                        </div>
                    </>
                );
            case 'ANALYZING':
            case 'IMPROVING':
                 return (
                    <div className="content-wrapper">
                        {userImage && <img src={userImage} alt="Analyzing your face" className="loading-image-flipper" />}
                        <h1 className="title">{appState === 'ANALYZING' ? 'Analyzing...' : 'Revealing Potential...'}</h1>
                        <p className="subtitle">{appState === 'ANALYZING' ? 'Our AI is roasting your features...' : 'Get ready for the glow-up...'}</p>
                    </div>
                );
            case 'RESULTS':
                if (!analysis || !userImage) return null;
                return (
                    <div className="results-container">
                        <div className="content-wrapper">
                             <h1 className="title">Your Analysis</h1>
                             <div className="segmented-control">
                                 <button className={resultsTab === 'RATINGS' ? 'active' : ''} onClick={() => setResultsTab('RATINGS')}>Rating</button>
                                 <button className={resultsTab === 'ROAST' ? 'active' : ''} onClick={() => setResultsTab('ROAST')}>Roast</button>
                                 <button className={resultsTab === 'IMPROVEMENTS' ? 'active' : ''} onClick={() => setResultsTab('IMPROVEMENTS')}>Improve</button>
                             </div>
                             <div className="tab-content">
                                {resultsTab === 'RATINGS' && (
                                    <div className="ratings-tab tab-content-pane" key="ratings">
                                        <img src={userImage} alt="Your selfie" className="profile-image" />
                                        <div className="ratings-grid">
                                            {Object.entries(analysis.ratings).map(([key, value]) => (
                                                <div key={key} className="rating-item">
                                                    <p className="rating-label">{key.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</p>
                                                    {/* FIX: Cast `value` to number as it's inferred as unknown. */}
                                                    <p className="rating-value" style={{ color: getColorForRating(value as number) }}>{value as number}</p>
                                                    <div className="progress-bar">
                                                        {/* FIX: Cast `value` to number as it's inferred as unknown. */}
                                                        <div className="progress-bar-inner" style={{ width: `${value as number}%`, backgroundColor: getColorForRating(value as number) }}></div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {resultsTab === 'ROAST' && (
                                     <div className="improvements-section tab-content-pane" key="roast">
                                        <div className="section-header">
                                            <h2 className="section-title">Brutal Roast</h2>
                                            <button 
                                                className="speak-button" 
                                                onClick={() => handleToggleSpeech(analysis.roast)}
                                                aria-label={isSpeaking && speakingText === analysis.roast ? 'Stop reading' : 'Read roast aloud'}>
                                                {isSpeaking && speakingText === analysis.roast ? <StopIcon /> : <SpeakIcon />}
                                            </button>
                                        </div>
                                        <p className="subtitle">{analysis.roast}</p>
                                    </div>
                                )}
                                 {resultsTab === 'IMPROVEMENTS' && (
                                    <div className="improvements-section tab-content-pane" key="improvements">
                                        <div className="section-header">
                                            <h2 className="section-title">How to Improve</h2>
                                            <button 
                                                className="speak-button" 
                                                onClick={() => handleToggleSpeech(analysis.improvements.join('. '))}
                                                aria-label={isSpeaking && speakingText === analysis.improvements.join('. ') ? 'Stop reading' : 'Read improvements aloud'}>
                                                {isSpeaking && speakingText === analysis.improvements.join('. ') ? <StopIcon /> : <SpeakIcon />}
                                            </button>
                                        </div>
                                        <ul className="improvements-list">
                                            {analysis.improvements.map((item, index) => <li key={index} style={{ animationDelay: `${index * 100}ms` }}>{item}</li>)}
                                        </ul>
                                    </div>
                                )}
                             </div>
                        </div>
                         <div className="footer-actions">
                            <button className="button" onClick={handleImprove}>Show My Potential</button>
                            <button className="button text" onClick={handleReset}>Start Over</button>
                        </div>
                    </div>
                );
            case 'IMPROVED':
                if (!userImage || !improvedImage) return null;
                return (
                    <>
                        <div className="content-wrapper">
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
                        </div>
                        <div className="footer-actions button-group">
                            <button className="button" onClick={handleShareAsPDF} disabled={isSharing}>
                                {isSharing ? 'Generating...' : 'Download Report'}
                            </button>
                            <button className="button secondary" onClick={handleReset}>Analyze Again</button>
                        </div>
                    </>
                );
            case 'PAYWALL':
                return renderPaywall();
            default:
                return null;
        }
    };
    
    const renderLogin = () => {
        return (
            <>
                <div className="content-wrapper">
                    <h1 className="title">Looksmax AI</h1>
                    <p className="subtitle">Sign in to get a brutally honest rating of your face and see your potential.</p>
                </div>
                <div className="footer-actions">
                    <button className="google-signin-button" onClick={handleSignIn}>
                        <svg width="24px" height="24px" viewBox="0 0 48 48" aria-hidden="true">
                            <g>
                                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                                <path fill="none" d="M0 0h48v48H0z"></path>
                            </g>
                        </svg>
                        <span>Sign in with Google</span>
                    </button>
                </div>
            </>
        )
    };
    
    if (authLoading) {
        return (
            <main className="container">
                <div className="content-wrapper">
                    {/* Render a simple loading spinner or nothing to prevent layout flash */}
                </div>
            </main>
        );
    }

    return (
        <main className="container">
            {!user ? renderLogin() : (
                <>
                    <div className="top-bar">
                        {user && credits !== 0 && appState !== 'INITIAL' && (
                             <div className="credits-display">
                                Scans: {credits === -1 ? '∞' : credits}
                            </div>
                        )}
                        <button className="logout-button" onClick={handleSignOut} aria-label="Sign Out">
                            <LogoutIcon />
                        </button>
                    </div>
                    {renderAppContent()}
                </>
            )}
            {error && <p className="error-message">{error}</p>}
        </main>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<App />);