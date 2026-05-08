import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause } from 'lucide-react';

export default function AudioPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

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

  const togglePlayPause = () => {
    const prevValue = isPlaying;
    setIsPlaying(!prevValue);
    if (!prevValue) {
      audioRef.current?.play();
    } else {
      audioRef.current?.pause();
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = Number(e.target.value);
    setCurrentTime(newTime);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
  };

  const formatTime = (time: number) => {
    if (time && !isNaN(time)) {
      const minutes = Math.floor(time / 60);
      const seconds = Math.floor(time % 60);
      return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    }
    return '0:00';
  };

  return (
    <div className="flex items-center bg-[#f0f2f5] p-2 rounded-full min-w-[200px] shadow-sm">
      <audio ref={audioRef} src={src} preload="metadata" />
      <button 
        onClick={togglePlayPause} 
        className="w-8 h-8 flex items-center justify-center bg-[#00a884] text-white rounded-full hover:bg-[#008f6f] flex-shrink-0"
      >
        {isPlaying ? <Pause size={16} className="fill-current" /> : <Play size={16} className="fill-current ml-0.5" />}
      </button>
      
      <div className="flex-1 mx-3 flex flex-col justify-center">
        <input 
          type="range" 
          min="0" 
          max={duration || 100} 
          value={currentTime} 
          onChange={handleSeek}
          className="w-full h-1.5 bg-gray-300 rounded-lg appearance-none cursor-pointer accent-[#00a884]"
        />
        <div className="flex justify-between mt-1 text-[10px] text-gray-500 font-medium">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
    </div>
  );
}
