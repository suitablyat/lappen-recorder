import { toPlayableVideoSource } from '../../renderer/videoSourceUtils';

describe('video source conversion', () => {
  test('keeps opaque remote sources unchanged', () => {
    const source = 'remote-vod://wcr/raid';
    expect(toPlayableVideoSource(source)).toBe(source);
  });

  test.each([
    'https://cloud.example.test/remote.php/dav/files/user/video.mp4',
    'http://localhost:8080/remote.php/dav/files/admin/video.mp4',
  ])('converts legacy HTTP(S) sources to an opaque remote source', (source) => {
    expect(toPlayableVideoSource(source)).toBe('remote-vod://wcr/video');
  });

  test('routes local Windows paths through the VOD protocol', () => {
    const source = 'F:\\recordings\\video.mp4';
    expect(toPlayableVideoSource(source)).toBe(`vod://wcr/${source}`);
  });
});
