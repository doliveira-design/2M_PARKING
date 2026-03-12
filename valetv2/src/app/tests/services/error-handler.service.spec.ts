import { TestBed, inject } from '@angular/core/testing';

import { ErrorHandlerService } from '../../services/error-handler.service';

describe('ErrorHandlerService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ErrorHandlerService]
    });
  });

  it('should be created', inject([ErrorHandlerService], (service: ErrorHandlerService) => {
    expect(service).toBeTruthy();
  }));
});
