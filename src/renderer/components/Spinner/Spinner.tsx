import { Box, CircularProgress } from '@mui/material';

interface SpinnerProps {
  size?: number | string;
  color?: string;
  className?: string;
}

export default function Spinner({
  size = '10vh',
  color = '#bb4420',
  className = '',
}: SpinnerProps) {
  return (
    <Box
      className={className}
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
      }}
    >
      <CircularProgress size={size} sx={{ color }} />
    </Box>
  );
}
