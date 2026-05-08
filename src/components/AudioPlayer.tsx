import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Play, Pause, User, Check, CheckCheck, Clock } from 'lucide-react';

type AudioPlayerProps = {
  src: string;
  senderPic?: string | null;
  isIncoming?: boolean;
  msgTimestamp?: string;
  msgStatus?: 'pending' | 'sent' | 'delivered' | 'read';
  onProfileClick?: () => void;
};

export default function AudioPlayer({ src, senderPic, isIncoming = true, msgTimestamp, msgStatus, onProfileClick }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  // Gera barrinhas pseudo-aleatórias como o WhatsApp (baseado no src como seed)
  const waveformBars = useMemo(() => {
    const bars: number[] = [];
    let seed = 0;
    for (let i = 0; i < src.length; i++) seed += src.charCodeAt(i);
    for (let i = 0; i < 40; i++) {
      seed = (seed * 16807 + 7) % 2147483647;
      bars.push(0.15 + (seed % 100) / 100 * 0.85);
    }
    return bars;
  }, [src]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const setAudioData = () => {
      if (audio.duration !== Infinity && !isNaN(audio.duration)) {
        setDuration(audio.duration);
      }
    };

    const setAudioTime = () => setCurrentTime(audio.currentTime);
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('loadedmetadata', setAudioData);
    audio.addEventListener('durationchange', setAudioData);
    audio.addEventListener('timeupdate', setAudioTime);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('loadedmetadata', setAudioData);
      audio.removeEventListener('durationchange', setAudioData);
      audio.removeEventListener('timeupdate', setAudioTime);
      audio.removeEventListener('ended', handleEnded);
    };
  }, []);

  // Desenhar waveform no canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const barWidth = 2.5;
    const gap = 1.5;
    const totalBarWidth = barWidth + gap;
    const maxBars = Math.floor(w / totalBarWidth);
    const barsToRender = waveformBars.slice(0, maxBars);
    const progress = duration > 0 ? currentTime / duration : 0;

    barsToRender.forEach((amplitude, i) => {
      const barHeight = amplitude * (h - 4);
      const x = i * totalBarWidth;
      const y = (h - barHeight) / 2;
      const barProgress = i / barsToRender.length;

      if (barProgress < progress) {
        ctx.fillStyle = isIncoming ? '#53bdeb' : '#4fc3a1';
      } else {
        ctx.fillStyle = isIncoming ? '#a0aeb8' : '#7bc2a8';
      }

      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barHeight, 1);
      ctx.fill();
    });
  }, [currentTime, duration, waveformBars, isIncoming]);

  const togglePlayPause = () => {
    const prevValue = isPlaying;
    setIsPlaying(!prevValue);
    if (!prevValue) {
      audioRef.current?.play();
    } else {
      audioRef.current?.pause();
    }
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !duration) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = clickX / rect.width;
    const newTime = ratio * duration;
    setCurrentTime(newTime);
    if (audioRef.current) audioRef.current.currentTime = newTime;
  };

  const formatTime = (time: number) => {
    if (time && !isNaN(time)) {
      const minutes = Math.floor(time / 60);
      const seconds = Math.floor(time % 60);
      return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    }
    return '0:00';
  };

  const avatarEl = (
    <div 
      className={`relative flex-shrink-0 ${onProfileClick ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
      onClick={onProfileClick}
    >
      <div className={`rounded-full overflow-hidden flex items-center justify-center bg-gray-300 dark:bg-gray-600 ${isIncoming ? 'w-[52px] h-[52px]' : 'w-[46px] h-[46px]'}`}>
        {senderPic
          ? <img src={senderPic} className="w-full h-full object-cover" alt="" />
          : <User size={isIncoming ? 26 : 22} className="text-white" />
        }
      </div>
      {/* Microfone ícone estilo WhatsApp */}
      <div className="absolute bottom-0.5 right-0.5 w-4 h-4 bg-[#53bdeb] rounded-full flex items-center justify-center shadow-sm">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="white">
          <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
          <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
        </svg>
      </div>
    </div>
  );

  return (
    <div className="flex items-center gap-2 min-w-[260px] max-w-[320px] pt-1 pb-0 px-1">
      <audio ref={audioRef} src={src} preload="metadata" />
      
      {/* Botão Play/Pause */}
      <button 
        onClick={togglePlayPause} 
        className="w-9 h-9 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white flex-shrink-0 transition-colors"
      >
        {isPlaying 
          ? <Pause size={22} className="fill-current" /> 
          : <Play size={22} className="fill-current ml-0.5" />
        }
      </button>
      
      {/* Waveform + Tempo */}
      <div className="flex-1 flex flex-col justify-center min-w-0">
        <canvas 
          ref={canvasRef} 
          className="w-full h-[28px] cursor-pointer" 
          onClick={handleCanvasClick}
        />
        <div className="flex justify-between items-center mt-0.5 px-0.5">
          <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
            {formatTime(isPlaying || currentTime > 0 ? currentTime : duration)}
          </span>
          
          {msgTimestamp && (
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-400 dark:text-gray-400">{msgTimestamp}</span>
              {!isIncoming && msgStatus && (
                <span className="flex items-center">
                  {msgStatus === 'read' ? <CheckCheck size={14} className="text-blue-500" /> : 
                   msgStatus === 'delivered' ? <CheckCheck size={14} className="text-gray-400" /> : 
                   msgStatus === 'sent' ? <Check size={14} className="text-gray-400" /> :
                   <Clock size={12} className="text-gray-400" />}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
      
      {/* Avatar grande à direita */}
      {avatarEl}
    </div>
  );
}
