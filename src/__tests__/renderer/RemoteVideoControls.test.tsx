import React from 'react';
import { TooltipProvider } from '@radix-ui/react-tooltip';
import { renderToStaticMarkup } from 'react-dom/server';
import { Language } from '../../localisation/phrases';
import { CloudStatus, RendererVideo } from '../../main/types';
import LockButton from '../../renderer/components/Tables/LockButton';
import TagButton from '../../renderer/components/Tables/TagButton';

jest.mock('../../renderer/rendererutils', () => ({
  lockVideos: jest.fn(),
  stopPropagation: jest.fn(),
}));

describe('remote video control capabilities', () => {
  test.each([
    [true, false, false, true, true],
    [true, true, false, true, false],
    [true, true, true, false, true],
    [false, false, false, true, false],
  ])(
    'lock: remote=%s, capability=%s, protected=%s, delete=%s',
    (cloud, protection, isProtected, del, disabled) => {
      const markup = renderToStaticMarkup(
        <TooltipProvider>
          <LockButton
            language={Language.ENGLISH}
            cloudStatus={{ write: true, del, protection } as CloudStatus}
            video={{ cloud, isProtected } as RendererVideo}
            setVideoState={jest.fn()}
          />
        </TooltipProvider>,
      );
      expect(markup.includes('disabled=""')).toBe(disabled);
    },
  );

  test.each([
    [true, false, true],
    [true, true, false],
    [false, false, false],
  ])('tag: remote=%s, capability=%s', (cloud, tags, disabled) => {
    const markup = renderToStaticMarkup(
      <TooltipProvider>
        <TagButton
          language={Language.ENGLISH}
          cloudStatus={{ write: true, tags } as CloudStatus}
          video={{ cloud, multiPov: [] } as unknown as RendererVideo}
          setDialog={jest.fn()}
          setTagDialogVideoTargetId={jest.fn()}
        />
      </TooltipProvider>,
    );
    expect(markup.includes('disabled=""')).toBe(disabled);
  });
});
