package File::HomeDir::Driver;

# Abstract base class that provides no functionality,
# but confirms the class is a File::HomeDir driver class.

use 5.008003;
use strict;
use warnings;
use Carp ();

use vars qw{$VERSION};

BEGIN
{
    $VERSION = '1.006';
}

sub my_home
{
    Carp::croak("$_[0] does not implement compulsory method $_[1]");
}

1;

=pod

=head1 NAME

File::HomeDir::Driver - Base class for all File::HomeDir drivers

=head1 DESCRIPTION

This module is the base class for all L<File::HomeDir> drivers, and must
be inherited from to identify a class as a driver.

It is primarily provided as a convenience for this specific identification
purpose, as L<File::HomeDir> supports the specification of custom drivers
and an C<-E<gt>isa> check is used during the loading of the driver.

=head1 AUTHOR

Adam Kennedy E<lt>adamk@cpan.orgE<gt>

=head1 SEE ALSO

L<File::HomeDir>

=head1 COPYRIGHT

Copyright 2009 - 2011 Adam Kennedy.

Copyright 2017 - 2020 Jens Rehsack

This program is free software; you can redistribute
it and/or modify it under the same terms as Perl itself.

The full text of the license can be found in the
LICENSE file included with this module.

=cut
