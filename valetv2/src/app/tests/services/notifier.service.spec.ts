import { TestBed, inject } from '@angular/core/testing';

import { NotifierService } from '../../services/notifier.service';

describe('NotifierService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [NotifierService]
    });
  });

  it('should be created', inject([NotifierService], (service: NotifierService) => {
    expect(service).toBeTruthy();
  }));
});
