from pydub import AudioSegment

# Load the file
audio = AudioSegment.from_file("Dark.mp3")

# Define start and end time in milliseconds (1 second = 1000 ms)
start_time = 0
end_time = 48 * 1000  # 48 seconds

# Trim the audio
trimmed_audio = audio[start_time:end_time]

# Export the result
trimmed_audio.export("Dark_0_to_48s.mp3", format="mp3")

print("Success! Saved as 'Dark_0_to_48s.mp3'")